import { Prisma } from '@prisma/client';
import { db } from '../../config/db';
import { precioDeLista } from '../productos/listas';

/**
 * Crea una factura de forma transaccional:
 *  1. Congela precios de venta actuales en los items.
 *  2. Descuenta stock y registra movimientos.
 *  3. Si la venta es a crédito, suma al saldo del cliente.
 * Todo o nada: si algo falla, no queda inventario descontado a medias.
 */
export async function crearFactura(vendedorId: string, datos: {
  clienteId: string;
  idLocal?: string;
  descuento: number;
  metodoPago?: string;
  listaPrecio?: string;
  notas?: string;
  items: { productoId: string; cantidad: number }[];
}) {
  // Idempotencia offline: si ya existe una factura con ese idLocal, devuélvela.
  if (datos.idLocal) {
    const existente = await db.factura.findUnique({
      where: { idLocal: datos.idLocal },
      include: { items: true },
    });
    if (existente) return { factura: existente, duplicada: true };
  }

  const factura = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const productos = await tx.producto.findMany({
      where: { id: { in: datos.items.map(i => i.productoId) } },
    });
    const porId = new Map<string, any>(productos.map((p: any) => [p.id, p]));

    let subtotal = 0;
    const items = datos.items.map(i => {
      const p = porId.get(i.productoId);
      if (!p) throw Object.assign(new Error(`Producto ${i.productoId} no existe`), { status: 400, expose: true });
      // Precio según la lista elegida (cae a precioVenta por defecto)
      const precio = precioDeLista(p, datos.listaPrecio);
      const total = precio * i.cantidad;
      subtotal += total;
      return { productoId: i.productoId, cantidad: i.cantidad, precioUnit: precio, total };
    });

    const total = subtotal - datos.descuento;
    const esCredito = datos.metodoPago === 'CREDITO';

    const f = await tx.factura.create({
      data: {
        clienteId: datos.clienteId,
        vendedorId,
        idLocal: datos.idLocal,
        subtotal,
        descuento: datos.descuento,
        total,
        pagado: esCredito ? 0 : total,
        metodoPago: datos.metodoPago,
        listaPrecio: datos.listaPrecio,
        notas: datos.notas,
        estado: esCredito ? 'CREDITO' : 'PENDIENTE',
        items: { create: items },
      },
      include: { items: true },
    });

    // Descontar stock + movimiento de inventario
    for (const i of datos.items) {
      await tx.producto.update({
        where: { id: i.productoId },
        data: { stock: { decrement: i.cantidad } },
      });
      await tx.movimientoStock.create({
        data: { productoId: i.productoId, tipo: 'SALIDA', cantidad: i.cantidad, facturaId: f.id },
      });
    }

    if (esCredito) {
      await tx.cliente.update({
        where: { id: datos.clienteId },
        data: { saldoPendiente: { increment: total } },
      });
    }

    return f;
  });

  return { factura, duplicada: false };
}

/**
 * Registra una DEVOLUCIÓN (nota crédito): documento con cantidades y valores
 * NEGATIVOS. Repone el stock de los productos devueltos.
 */
export async function crearDevolucion(vendedorId: string, datos: {
  clienteId: string;
  listaPrecio?: string;
  notas?: string;
  items: { productoId: string; cantidad: number }[];
}) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const productos = await tx.producto.findMany({
      where: { id: { in: datos.items.map(i => i.productoId) } },
    });
    const porId = new Map<string, any>(productos.map((p: any) => [p.id, p]));

    let subtotal = 0;
    const items = datos.items.map(i => {
      const p = porId.get(i.productoId);
      if (!p) throw Object.assign(new Error(`Producto ${i.productoId} no existe`), { status: 400, expose: true });
      const precio = precioDeLista(p, datos.listaPrecio);
      const cant = Math.abs(i.cantidad);
      const total = -(precio * cant); // negativo: es una devolución
      subtotal += total;
      return { productoId: i.productoId, cantidad: -cant, precioUnit: precio, total };
    });

    const f = await tx.factura.create({
      data: {
        tipoDoc: 'DEVOLUCION',
        clienteId: datos.clienteId,
        vendedorId,
        subtotal,
        descuento: 0,
        total: subtotal,
        pagado: subtotal,
        listaPrecio: datos.listaPrecio,
        notas: datos.notas,
        estado: 'ENTREGADA',
        items: { create: items },
      },
      include: { items: true },
    });

    // La mercancía devuelta vuelve al inventario.
    for (const i of datos.items) {
      const cant = Math.abs(i.cantidad);
      await tx.producto.update({
        where: { id: i.productoId },
        data: { stock: { increment: cant } },
      });
      await tx.movimientoStock.create({
        data: { productoId: i.productoId, tipo: 'DEVOLUCION', cantidad: cant, facturaId: f.id, motivo: datos.notas },
      });
    }

    return f;
  });
}

/**
 * Registra una DEVOLUCIÓN sobre una venta existente (TOTAL o PARCIAL).
 * La hace el entregador/admin: repone stock, crea un documento DEVOLUCION
 * (negativo) enlazado a la venta origen y marca la venta (devuelta, monto, estado).
 */
export async function registrarDevolucion(actorId: string, facturaId: string, datos: {
  tipo: 'PARCIAL' | 'TOTAL';
  causal: string;
  obs?: string;
  items?: { productoId: string; cantidad: number }[];
}) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const origen: any = await tx.factura.findUnique({ where: { id: facturaId }, include: { items: true } });
    if (!origen) throw Object.assign(new Error('Factura no encontrada'), { status: 404, expose: true });
    if (origen.tipoDoc !== 'VENTA') throw Object.assign(new Error('Solo se devuelven ventas'), { status: 400, expose: true });
    if (origen.estado === 'ANULADA') throw Object.assign(new Error('La factura está anulada'), { status: 400, expose: true });
    if (origen.devuelta === 'TOTAL') throw Object.assign(new Error('La venta ya fue devuelta'), { status: 400, expose: true });

    const porProd = new Map<string, number>();
    const maxPorProd = new Map<string, number>();
    for (const it of origen.items) maxPorProd.set(it.productoId, (maxPorProd.get(it.productoId) ?? 0) + it.cantidad);

    if (datos.tipo === 'TOTAL') {
      for (const [pid, cant] of maxPorProd) porProd.set(pid, cant);
    } else {
      if (!datos.items?.length) throw Object.assign(new Error('Selecciona los productos a devolver'), { status: 400, expose: true });
      for (const d of datos.items) {
        const max = maxPorProd.get(d.productoId) ?? 0;
        const cant = Math.min(Math.abs(d.cantidad), max);
        if (cant > 0) porProd.set(d.productoId, cant);
      }
      if (!porProd.size) throw Object.assign(new Error('Nada que devolver'), { status: 400, expose: true });
    }

    const precioPorProd = new Map<string, number>();
    for (const it of origen.items) precioPorProd.set(it.productoId, Number(it.precioUnit));
    let subtotalDev = 0;
    const itemsDev = [...porProd.entries()].map(([productoId, cant]) => {
      const precio = precioPorProd.get(productoId) ?? 0;
      const total = -(precio * cant);
      subtotalDev += total;
      return { productoId, cantidad: -cant, precioUnit: precio, total };
    });

    const dev = await (tx.factura as any).create({
      data: {
        tipoDoc: 'DEVOLUCION',
        clienteId: origen.clienteId,
        vendedorId: origen.vendedorId,
        entregadorId: actorId,
        facturaOrigenId: origen.id,
        subtotal: subtotalDev,
        descuento: 0,
        total: subtotalDev,
        pagado: subtotalDev,
        listaPrecio: origen.listaPrecio,
        causal: datos.causal,
        obsDevolucion: datos.obs,
        notas: datos.obs,
        estado: 'ENTREGADA',
        items: { create: itemsDev },
      },
    });

    for (const [productoId, cant] of porProd) {
      await tx.producto.update({ where: { id: productoId }, data: { stock: { increment: cant } } });
      await tx.movimientoStock.create({
        data: { productoId, tipo: 'DEVOLUCION', cantidad: cant, facturaId: dev.id, motivo: `Devolución ${datos.tipo} #${origen.consecutivo}` },
      });
    }

    const montoDevuelto = Math.abs(subtotalDev);
    const data: any = {
      devuelta: datos.tipo,
      causal: datos.causal,
      obsDevolucion: datos.obs ?? null,
      montoDevuelto: { increment: montoDevuelto },
    };
    if (datos.tipo === 'TOTAL') {
      data.estado = 'DEVUELTA';
      data.entregadoEn = null;
    } else if (origen.estado === 'PENDIENTE') {
      data.estado = 'ENTREGADA';
      data.entregadoEn = new Date();
      data.entregadorId = actorId;
    }
    return tx.factura.update({ where: { id: origen.id }, data });
  });
}

/**
 * Revivir un pedido devuelto. Admin/Coadmin/Supervisor/Entregador lo ejecutan
 * directo (anulan las devoluciones, vuelve a salir el stock y el pedido regresa
 * a PENDIENTE para la cola de logística). El VENDEDOR solo deja la solicitud.
 */
export async function revivirEntrega(actorRol: string, facturaId: string) {
  const puedeAprobar = ['ADMIN', 'COADMIN', 'SUPERVISOR', 'ENTREGADOR'].includes(actorRol);
  if (!puedeAprobar) {
    const f = await (db.factura as any).update({ where: { id: facturaId }, data: { revivirSolicitado: true } });
    return { solicitado: true, factura: f };
  }
  const factura = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const origen = await tx.factura.findUnique({ where: { id: facturaId } });
    if (!origen) throw Object.assign(new Error('Factura no encontrada'), { status: 404, expose: true });

    const devs: any[] = await (tx.factura as any).findMany({
      where: { facturaOrigenId: origen.id, tipoDoc: 'DEVOLUCION', estado: { not: 'ANULADA' } },
      include: { items: true },
    });
    for (const d of devs) {
      for (const it of d.items) {
        const cant = Math.abs(it.cantidad);
        await tx.producto.update({ where: { id: it.productoId }, data: { stock: { decrement: cant } } });
        await tx.movimientoStock.create({
          data: { productoId: it.productoId, tipo: 'SALIDA', cantidad: cant, facturaId: d.id, motivo: `Revivir pedido #${origen.consecutivo}` },
        });
      }
      await tx.factura.update({ where: { id: d.id }, data: { estado: 'ANULADA' } });
    }

    return (tx.factura as any).update({
      where: { id: origen.id },
      data: {
        devuelta: 'NO', causal: null, obsDevolucion: null, montoDevuelto: 0,
        revivirSolicitado: false, estado: 'PENDIENTE', entregadoEn: null,
      },
    });
  });
  return { solicitado: false, factura };
}

/**
 * Editar un PEDIDO no entregado (estado PENDIENTE): cambia ítems, descuento,
 * método de pago y notas. Restaura el stock de los ítems viejos, descuenta los
 * nuevos, recalcula totales y ajusta la cartera si pasa a crédito.
 * Lo edita el vendedor dueño o ADMIN/COADMIN/SUPERVISOR.
 */
export async function editarFactura(actor: { id: string; rol: string }, facturaId: string, datos: {
  items: { productoId: string; cantidad: number }[];
  descuento?: number;
  metodoPago?: string;
  notas?: string;
}) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const f = await tx.factura.findUnique({ where: { id: facturaId }, include: { items: true } });
    if (!f) throw Object.assign(new Error('Factura no encontrada'), { status: 404, expose: true });
    if (f.tipoDoc !== 'VENTA') throw Object.assign(new Error('Solo se editan ventas'), { status: 400, expose: true });
    if (f.estado !== 'PENDIENTE') throw Object.assign(new Error('Solo se edita un pedido pendiente (no entregado)'), { status: 400, expose: true });
    if (actor.rol === 'VENDEDOR' && f.vendedorId !== actor.id) {
      throw Object.assign(new Error('Solo puedes editar tus propios pedidos'), { status: 403, expose: true });
    }

    for (const it of f.items) {
      await tx.producto.update({ where: { id: it.productoId }, data: { stock: { increment: it.cantidad } } });
    }

    const productos = await tx.producto.findMany({ where: { id: { in: datos.items.map(i => i.productoId) } } });
    const porId = new Map<string, any>(productos.map((p: any) => [p.id, p]));
    let subtotal = 0;
    const nuevos = datos.items.map(i => {
      const p = porId.get(i.productoId);
      if (!p) throw Object.assign(new Error(`Producto ${i.productoId} no existe`), { status: 400, expose: true });
      const precio = precioDeLista(p, f.listaPrecio);
      const total = precio * i.cantidad;
      subtotal += total;
      return { productoId: i.productoId, cantidad: i.cantidad, precioUnit: precio, total };
    });

    const descuento = datos.descuento ?? Number(f.descuento);
    const total = subtotal - descuento;
    const metodoPago = datos.metodoPago ?? f.metodoPago ?? undefined;
    const esCredito = metodoPago === 'CREDITO';

    for (const i of datos.items) {
      await tx.producto.update({ where: { id: i.productoId }, data: { stock: { decrement: i.cantidad } } });
    }
    if (esCredito) {
      await tx.cliente.update({ where: { id: f.clienteId }, data: { saldoPendiente: { increment: total } } });
    }

    await tx.facturaItem.deleteMany({ where: { facturaId: f.id } });
    await tx.factura.update({
      where: { id: f.id },
      data: {
        subtotal,
        descuento,
        total,
        pagado: esCredito ? 0 : total,
        metodoPago,
        notas: datos.notas ?? f.notas,
        estado: esCredito ? 'CREDITO' : 'PENDIENTE',
        items: { create: nuevos },
      },
    });
    return tx.factura.findUnique({ where: { id: f.id }, include: { items: true } });
  });
}

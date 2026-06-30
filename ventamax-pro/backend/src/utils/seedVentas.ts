import { db } from '../config/db';

// Generador de VENTAS DE PRUEBA en el servidor (corre contra la base real).
// Mezcla: efectivo, transferencia y fiado (credito) + devoluciones parciales/totales.
// Todo queda marcado con notas = 'SEED_PRUEBA' para poder limpiarlo despues.

const TAG = 'SEED_PRUEBA';
const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(a: T[]): T => a[rnd(a.length)];
const chance = (p: number) => Math.random() < p;

async function enLotes<T>(items: T[], tam: number, fn: (x: T) => Promise<any>) {
  for (let i = 0; i < items.length; i += tam) {
    await Promise.all(items.slice(i, i + tam).map(fn));
  }
}

export async function seedVentasMix(n = 300) {
  const [clientes, productos, vendedores, actores] = await Promise.all([
    db.cliente.findMany({ where: { activo: true }, select: { id: true }, take: 1000 }),
    db.producto.findMany({ where: { activo: true }, select: { id: true, precioTat: true, precioVenta: true } }),
    db.usuario.findMany({ where: { rol: { in: ['VENDEDOR', 'SUPERVISOR'] }, activo: true }, select: { id: true } }),
    db.usuario.findMany({ where: { rol: { in: ['ENTREGADOR', 'SUPERVISOR', 'ADMIN', 'COADMIN'] }, activo: true }, select: { id: true } }),
  ]);
  if (!clientes.length || !productos.length || !vendedores.length) {
    return { error: 'Faltan clientes, productos o vendedores en la base.', clientes: clientes.length, productos: productos.length, vendedores: vendedores.length };
  }
  const actoresDev = actores.length ? actores : vendedores;

  let efectivo = 0, transfer = 0, fiados = 0, devolT = 0, devolP = 0;
  const saldoPorCliente = new Map<string, number>();

  // 1) Construir las 300 ventas (sin tocar DB todavia)
  const ventasData: any[] = [];
  for (let i = 0; i < n; i++) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - rnd(21));
    fecha.setHours(8 + rnd(9), rnd(60), 0, 0);

    const nItems = 1 + rnd(5);
    const items: any[] = [];
    const usados = new Set<string>();
    let subtotal = 0;
    for (let k = 0; k < nItems; k++) {
      const p = pick(productos);
      if (usados.has(p.id)) continue;
      usados.add(p.id);
      const precio = Number(p.precioTat) > 0 ? Number(p.precioTat) : Number(p.precioVenta);
      if (!precio) continue;
      const cantidad = 1 + rnd(12);
      subtotal += precio * cantidad;
      items.push({ productoId: p.id, cantidad, precioUnit: precio, total: precio * cantidad });
    }
    if (!items.length) continue;
    const total = subtotal;

    const r = Math.random();
    let metodoPago: string, pagado: number, estado: string, saldo = 0;
    if (r < 0.40) { metodoPago = 'EFECTIVO'; pagado = total; estado = 'PAGADA'; efectivo++; }
    else if (r < 0.70) { metodoPago = 'TRANSFERENCIA'; pagado = total; estado = 'PAGADA'; transfer++; }
    else { metodoPago = 'CREDITO'; pagado = chance(0.4) ? Math.round(total * (0.2 + Math.random() * 0.5)) : 0; estado = 'CREDITO'; saldo = total - pagado; fiados++; }

    const clienteId = pick(clientes).id;
    const vendedorId = pick(vendedores).id;
    if (saldo > 0) saldoPorCliente.set(clienteId, (saldoPorCliente.get(clienteId) ?? 0) + saldo);
    ventasData.push({ clienteId, vendedorId, estado, subtotal, total, pagado, metodoPago, fecha, items });
  }

  // 2) Crear ventas en lotes y guardar ids
  const ventas: any[] = [];
  await enLotes(ventasData, 10, async (v) => {
    const f = await db.factura.create({
      data: {
        clienteId: v.clienteId, vendedorId: v.vendedorId, estado: v.estado,
        subtotal: v.subtotal, descuento: 0, total: v.total, pagado: v.pagado,
        metodoPago: v.metodoPago, listaPrecio: 'TAT', notas: TAG, creadoEn: v.fecha, entregadoEn: v.fecha,
        items: { create: v.items },
      },
      select: { id: true },
    });
    ventas.push({ id: f.id, clienteId: v.clienteId, vendedorId: v.vendedorId, fecha: v.fecha, items: v.items });
  });

  // 3) Sumar saldo de fiados
  await enLotes(Array.from(saldoPorCliente.entries()), 10, async ([clienteId, s]) =>
    db.cliente.update({ where: { id: clienteId }, data: { saldoPendiente: { increment: s } } }));

  // 4) Devoluciones: 10% totales, 15% parciales
  const aDevolver: any[] = [];
  for (const v of ventas) {
    const r = Math.random();
    const esTotal = r < 0.10;
    const esParcial = !esTotal && r < 0.25;
    if (!esTotal && !esParcial) continue;
    let its = v.items;
    if (esParcial) {
      its = v.items.filter(() => chance(0.5));
      if (!its.length) its = [v.items[0]];
      its = its.map((it: any) => ({ ...it, cantidad: Math.max(1, Math.floor(it.cantidad * (0.3 + Math.random() * 0.6))) }));
    }
    let sub = 0;
    const itemsDev = its.map((it: any) => { const t = -(it.precioUnit * it.cantidad); sub += t; return { productoId: it.productoId, cantidad: -it.cantidad, precioUnit: it.precioUnit, total: t }; });
    const fechaDev = new Date(v.fecha); fechaDev.setDate(fechaDev.getDate() + 1 + rnd(3)); if (fechaDev > new Date()) fechaDev.setTime(Date.now()); fechaDev.setHours(9 + rnd(8), rnd(60), 0, 0);
    aDevolver.push({ v, esTotal, sub, itemsDev, monto: Math.abs(sub), fechaDev });
    if (esTotal) devolT++; else devolP++;
  }
  await enLotes(aDevolver, 10, async (d) => {
    await db.factura.create({
      data: {
        tipoDoc: 'DEVOLUCION', clienteId: d.v.clienteId, vendedorId: d.v.vendedorId, entregadorId: pick(actoresDev).id,
        facturaOrigenId: d.v.id, subtotal: d.sub, descuento: 0, total: d.sub, pagado: d.sub, listaPrecio: 'TAT', estado: 'ENTREGADA',
        causal: pick(['AVERIADO', 'VENCIDO', 'NO_PEDIDO', 'EQUIVOCADO']), notas: TAG, obsDevolucion: TAG, creadoEn: d.fechaDev, entregadoEn: d.fechaDev,
        items: { create: d.itemsDev },
      },
    });
    await db.factura.update({ where: { id: d.v.id }, data: { devuelta: d.esTotal ? 'TOTAL' : 'PARCIAL', montoDevuelto: { increment: d.monto }, ...(d.esTotal ? { estado: 'DEVUELTA' } : {}) } });
  });

  return { ventas: ventas.length, efectivo, transfer, fiados, devolucionesTotales: devolT, devolucionesParciales: devolP };
}

export async function limpiarVentasPrueba() {
  const fiados = await db.factura.findMany({ where: { notas: TAG, tipoDoc: 'VENTA', metodoPago: 'CREDITO' }, select: { clienteId: true, total: true, pagado: true } });
  const porCliente = new Map<string, number>();
  for (const f of fiados) { const s = Number(f.total) - Number(f.pagado); if (s > 0) porCliente.set(f.clienteId, (porCliente.get(f.clienteId) ?? 0) + s); }
  for (const [clienteId, s] of Array.from(porCliente.entries())) {
    await db.cliente.update({ where: { id: clienteId }, data: { saldoPendiente: { decrement: s } } });
  }
  const ids = (await db.factura.findMany({ where: { notas: TAG }, select: { id: true } })).map((x) => x.id);
  if (!ids.length) return { borradas: 0 };
  await db.facturaItem.deleteMany({ where: { facturaId: { in: ids } } });
  await db.movimientoStock.deleteMany({ where: { facturaId: { in: ids } } });
  await db.factura.deleteMany({ where: { notas: TAG, tipoDoc: 'DEVOLUCION' } });
  await db.factura.deleteMany({ where: { notas: TAG } });
  return { borradas: ids.length, clientesAjustados: porCliente.size };
}

import { Prisma } from '@prisma/client';
import { db } from '../../config/db';

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
    const porId = new Map<string, { id: string; precioVenta: unknown }>(productos.map((p: any) => [p.id, p]));

    let subtotal = 0;
    const items = datos.items.map(i => {
      const p = porId.get(i.productoId);
      if (!p) throw Object.assign(new Error(`Producto ${i.productoId} no existe`), { status: 400, expose: true });
      const precio = Number(p.precioVenta);
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

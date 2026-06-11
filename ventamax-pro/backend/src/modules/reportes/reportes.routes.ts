import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';

export const reportesRouter = Router();
reportesRouter.use(requiereAuth);

function rango(req: any) {
  const desde = req.query.desde ? new Date(String(req.query.desde)) : new Date(new Date().setDate(1));
  const hasta = req.query.hasta ? new Date(String(req.query.hasta) + 'T23:59:59') : new Date();
  return { desde, hasta };
}

// GET /api/reportes/resumen?desde=&hasta= — agregados generales (ADMIN/COADMIN)
// Con 450k facturas/mes los reportes se calculan en la base de datos
// con agregaciones SQL — jamás descargando todo al frontend.
reportesRouter.get('/resumen', requiereRol('ADMIN', 'COADMIN'), async (req, res, next) => {
  try {
    const { desde, hasta } = rango(req);

    const [ventas, porVendedor, topProductos, gastos, vendedores, productos] = await Promise.all([
      db.factura.aggregate({
        where: { creadoEn: { gte: desde, lte: hasta }, estado: { not: 'ANULADA' } },
        _sum: { total: true, pagado: true },
        _count: true,
      }),
      db.factura.groupBy({
        by: ['vendedorId'],
        where: { creadoEn: { gte: desde, lte: hasta }, estado: { not: 'ANULADA' } },
        _sum: { total: true },
        _count: true,
        orderBy: { _sum: { total: 'desc' } },
        take: 50,
      }),
      db.facturaItem.groupBy({
        by: ['productoId'],
        where: { factura: { creadoEn: { gte: desde, lte: hasta }, estado: { not: 'ANULADA' } } },
        _sum: { cantidad: true, total: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 20,
      }),
      db.gasto.aggregate({
        where: { fecha: { gte: desde, lte: hasta } },
        _sum: { monto: true },
        _count: true,
      }),
      db.usuario.findMany({ select: { id: true, nombre: true } }),
      db.producto.findMany({ select: { id: true, nombre: true } }),
    ]);

    // Resolver nombres (los groupBy de Prisma no hacen join)
    const nombreVendedor = new Map(vendedores.map((v: any) => [v.id, v.nombre]));
    const nombreProducto = new Map(productos.map((p: any) => [p.id, p.nombre]));

    res.json({
      rango: { desde, hasta },
      ventas,
      gastos,
      porVendedor: porVendedor.map((v: any) => ({ ...v, nombre: nombreVendedor.get(v.vendedorId) ?? '—' })),
      topProductos: topProductos.map((p: any) => ({ ...p, nombre: nombreProducto.get(p.productoId) ?? '—' })),
    });
  } catch (e) { next(e); }
});

// GET /api/reportes/semana — ventas por día (últimos 7 días) del usuario o global si admin
reportesRouter.get('/semana', async (req, res, next) => {
  try {
    const esAdmin = ['ADMIN', 'COADMIN'].includes(req.usuario!.rol);
    const filtroVendedor = esAdmin ? Prisma.empty : Prisma.sql`AND "vendedorId" = ${req.usuario!.id}`;
    const filas = await db.$queryRaw(Prisma.sql`
      SELECT DATE("creadoEn") AS dia, COUNT(*)::int AS ventas, COALESCE(SUM(total), 0)::float AS total
      FROM facturas
      WHERE "creadoEn" >= NOW() - INTERVAL '7 days' AND estado != 'ANULADA' ${filtroVendedor}
      GROUP BY DATE("creadoEn")
      ORDER BY dia ASC
    `) as any[];
    res.json(filas);
  } catch (e) { next(e); }
});

// GET /api/reportes/cartera — clientes con saldo pendiente (crédito)
reportesRouter.get('/cartera', requiereRol('ADMIN', 'COADMIN'), async (_req, res, next) => {
  try {
    const clientes = await db.cliente.findMany({
      where: { saldoPendiente: { gt: 0 } },
      select: { id: true, nombre: true, barrio: true, telefono: true, saldoPendiente: true },
      orderBy: { saldoPendiente: 'desc' },
      take: 200,
    });
    const total = await db.cliente.aggregate({ _sum: { saldoPendiente: true } });
    res.json({ total: total._sum.saldoPendiente ?? 0, clientes });
  } catch (e) { next(e); }
});

// GET /api/reportes/mi-dia — resumen del vendedor autenticado (hoy)
reportesRouter.get('/mi-dia', async (req, res, next) => {
  try {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const r = await db.factura.aggregate({
      where: { vendedorId: req.usuario!.id, creadoEn: { gte: hoy }, estado: { not: 'ANULADA' } },
      _sum: { total: true },
      _count: true,
    });
    res.json({ ventasHoy: r._count, totalHoy: r._sum.total ?? 0 });
  } catch (e) { next(e); }
});

// GET /api/reportes/exportar-facturas?desde=&hasta= — filas planas para Excel (máx 10.000)
reportesRouter.get('/exportar-facturas', requiereRol('ADMIN', 'COADMIN'), async (req, res, next) => {
  try {
    const { desde, hasta } = rango(req);
    const facturas = await db.factura.findMany({
      where: { creadoEn: { gte: desde, lte: hasta } },
      take: 10_000,
      orderBy: { creadoEn: 'asc' },
      include: {
        cliente: { select: { nombre: true, barrio: true } },
        vendedor: { select: { nombre: true } },
      },
    });
    res.json(facturas.map((f: any) => ({
      consecutivo: f.consecutivo,
      fecha: f.creadoEn,
      cliente: f.cliente?.nombre,
      barrio: f.cliente?.barrio,
      vendedor: f.vendedor?.nombre,
      estado: f.estado,
      subtotal: Number(f.subtotal),
      descuento: Number(f.descuento),
      total: Number(f.total),
      pagado: Number(f.pagado),
      metodoPago: f.metodoPago,
    })));
  } catch (e) { next(e); }
});

import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';
import { validarBody } from '../../middleware/validate';
import { leerPaginacion, respuestaPaginada } from '../../utils/pagination';
import { clienteSchema, clienteUpdateSchema } from './clientes.schemas';
import { maxCodigoCliente } from './codigo';

export const clientesRouter = Router();
clientesRouter.use(requiereAuth);

// GET /api/clientes?busqueda=&dia=&pagina=&porPagina=
clientesRouter.get('/', async (req, res, next) => {
  try {
    const { pagina, porPagina, skip, take } = leerPaginacion(req);
    const where: any = { activo: true };
    if (req.query.busqueda) {
      const q = String(req.query.busqueda);
      where.OR = [
        { nombre: { contains: q, mode: 'insensitive' } },
        { barrio: { contains: q, mode: 'insensitive' } },
        { ciudad: { contains: q, mode: 'insensitive' } },
        { direccion: { contains: q, mode: 'insensitive' } },
        { contacto: { contains: q, mode: 'insensitive' } },
        { telefono: { contains: q, mode: 'insensitive' } },
      ];
      // Si busca un número, también compara por código
      const n = Number(q.replace(/\D/g, ''));
      if (!Number.isNaN(n) && n > 0) where.OR.push({ codigo: n });
    }
    if (req.query.dia) where.diaVisita = Number(req.query.dia);
    if (req.query.barrio) where.barrio = String(req.query.barrio);

    const [datos, total] = await Promise.all([
      db.cliente.findMany({ where, skip, take, orderBy: { nombre: 'asc' } }),
      db.cliente.count({ where }),
    ]);
    res.json(respuestaPaginada(datos, total, pagina, porPagina));
  } catch (e) { next(e); }
});

// GET /api/clientes/barrios — barrios con conteo, para los chips de filtro.
// Debe ir ANTES de "/:id" para que Express no lo trate como un id.
clientesRouter.get('/barrios', async (req, res, next) => {
  try {
    const where: any = { activo: true, barrio: { not: null } };
    if (req.query.dia) where.diaVisita = Number(req.query.dia);
    const filas = await db.cliente.groupBy({
      by: ['barrio'],
      where,
      _count: true,
      orderBy: { _count: { barrio: 'desc' } },
      take: 100,
    });
    res.json(filas.map((f: any) => ({ barrio: f.barrio as string, total: f._count })));
  } catch (e) { next(e); }
});

// GET /api/clientes/duplicados — grupos de clientes que comparten NIT (admin).
// Debe ir ANTES de "/:id".
clientesRouter.get('/duplicados', requiereRol('ADMIN', 'COADMIN'), async (_req, res, next) => {
  try {
    const grupos = await db.cliente.groupBy({
      by: ['nit'],
      where: { activo: true, nit: { not: null } },
      _count: { _all: true },
      having: { nit: { _count: { gt: 1 } } },
    });
    const nits = grupos.map((g: any) => g.nit).filter(Boolean);
    if (!nits.length) return res.json([]);

    const clientes = await db.cliente.findMany({
      where: { activo: true, nit: { in: nits } },
      select: {
        id: true, nit: true, codigo: true, nombre: true, razonSocial: true,
        ciudad: true, barrio: true, telefono: true, listaPrecio: true,
        _count: { select: { facturas: true } },
      },
      orderBy: [{ nit: 'asc' }, { codigo: 'asc' }],
    });

    const porNit = new Map<string, any[]>();
    for (const c of clientes) {
      const k = c.nit as string;
      if (!porNit.has(k)) porNit.set(k, []);
      porNit.get(k)!.push(c);
    }
    res.json([...porNit.entries()].map(([nit, lista]) => ({ nit, clientes: lista })));
  } catch (e) { next(e); }
});

// POST /api/clientes/fusionar — fusiona duplicados en uno (admin).
// Reasigna facturas y visitas al cliente que se mantiene y desactiva los demás.
clientesRouter.post('/fusionar', requiereRol('ADMIN', 'COADMIN'), async (req, res, next) => {
  try {
    const { mantenerId, eliminarIds } = req.body as { mantenerId: string; eliminarIds: string[] };
    if (!mantenerId || !Array.isArray(eliminarIds) || !eliminarIds.length) {
      return res.status(400).json({ error: 'Falta el cliente a mantener o la lista a fusionar' });
    }
    const ids = eliminarIds.filter(id => id && id !== mantenerId);
    if (!ids.length) return res.status(400).json({ error: 'Nada que fusionar' });

    const fusionados = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.factura.updateMany({ where: { clienteId: { in: ids } }, data: { clienteId: mantenerId } });
      await tx.visita.updateMany({ where: { clienteId: { in: ids } }, data: { clienteId: mantenerId } });
      // El saldo pendiente de los duplicados pasa al cliente que se mantiene.
      const dupes = await tx.cliente.findMany({ where: { id: { in: ids } }, select: { saldoPendiente: true } });
      const suma = dupes.reduce((s: number, c: any) => s + Number(c.saldoPendiente), 0);
      if (suma > 0) {
        await tx.cliente.update({ where: { id: mantenerId }, data: { saldoPendiente: { increment: suma } } });
      }
      const r = await tx.cliente.updateMany({ where: { id: { in: ids } }, data: { activo: false } });
      return r.count;
    });

    res.json({ fusionados });
  } catch (e) { next(e); }
});

// GET /api/clientes/mapa?dia= — clientes con GPS y su estado del día (mapa)
// Debe ir ANTES de "/:id". Estado: vendido > no_compra > pendiente (para HOY).
clientesRouter.get('/mapa', async (req, res, next) => {
  try {
    const where: any = { activo: true, lat: { not: null }, lng: { not: null } };
    if (req.query.dia) where.diaVisita = Number(req.query.dia);
    const clientes = await db.cliente.findMany({
      where,
      select: { id: true, nombre: true, codigo: true, direccion: true, barrio: true, ciudad: true, telefono: true, lat: true, lng: true, diaVisita: true },
      take: 5000,
    });
    const ids = clientes.map((c: any) => c.id);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const [vendidas, visitas] = ids.length ? await Promise.all([
      db.factura.groupBy({ by: ['clienteId'], where: { clienteId: { in: ids }, creadoEn: { gte: hoy }, estado: { not: 'ANULADA' } } }),
      db.visita.groupBy({ by: ['clienteId'], where: { clienteId: { in: ids }, creadoEn: { gte: hoy } } }),
    ]) : [[], []];
    const vend = new Set(vendidas.map((v: any) => v.clienteId));
    const vis = new Set(visitas.map((v: any) => v.clienteId));
    res.json(clientes.map((c: any) => ({
      ...c,
      estado: vend.has(c.id) ? 'vendido' : vis.has(c.id) ? 'no_compra' : 'pendiente',
    })));
  } catch (e) { next(e); }
});

// POST /api/clientes/:id/no-compra — registra visita sin compra con causal
clientesRouter.post('/:id/no-compra', async (req, res, next) => {
  try {
    const causal = String(req.body?.causal ?? '').trim();
    if (!causal) return res.status(400).json({ error: 'La causal es obligatoria' });
    await db.visita.create({
      data: { clienteId: req.params.id, vendedorId: req.usuario!.id, causal, notas: req.body?.notas || null },
    });
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/clientes/:id — detalle: cliente + últimas facturas + estadísticas
clientesRouter.get('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const cliente = await db.cliente.findUnique({
      where: { id },
      include: {
        facturas: {
          take: 10,
          orderBy: { creadoEn: 'desc' },
          include: { items: { include: { producto: { select: { nombre: true, categoria: true } } } } },
        },
      },
    });
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const whereCli = { clienteId: id, estado: { not: 'ANULADA' as const } };
    const [agg, unidades, hoyCount, cats] = await Promise.all([
      db.factura.aggregate({ where: whereCli, _sum: { total: true }, _count: true }),
      db.facturaItem.aggregate({ where: { factura: whereCli }, _sum: { cantidad: true } }),
      db.factura.count({ where: { ...whereCli, creadoEn: { gte: hoy } } }),
      db.facturaItem.findMany({
        where: { factura: whereCli },
        select: { producto: { select: { categoria: true } } },
        take: 2000,
      }),
    ]);
    const categorias = new Set(
      cats.map((c: any) => c.producto?.categoria).filter(Boolean)).size;
    const pedidos = agg._count;
    const total = Number(agg._sum.total ?? 0);

    res.json({
      ...cliente,
      stats: {
        total,
        pedidos,
        unidades: unidades._sum.cantidad ?? 0,
        ticketPromedio: pedidos ? Math.round(total / pedidos) : 0,
        hoy: hoyCount,
        categorias,
      },
    });
  } catch (e) { next(e); }
});

clientesRouter.post('/', validarBody(clienteSchema), async (req, res, next) => {
  try {
    // Al crear un cliente individual, el sistema le asigna el siguiente código VMX.
    const codigo = (await maxCodigoCliente()) + 1;
    res.status(201).json(await db.cliente.create({ data: { ...req.body, codigo } }));
  } catch (e) { next(e); }
});

clientesRouter.put('/:id', validarBody(clienteUpdateSchema), async (req, res, next) => {
  try {
    res.json(await db.cliente.update({ where: { id: req.params.id }, data: req.body }));
  } catch (e) { next(e); }
});

// Borrado lógico — solo admins. Nunca borramos datos con historial de ventas.
clientesRouter.delete('/:id', requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    await db.cliente.update({ where: { id: req.params.id }, data: { activo: false } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

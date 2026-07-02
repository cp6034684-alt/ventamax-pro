import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';
import { validarBody } from '../../middleware/validate';
import { leerPaginacion, respuestaPaginada } from '../../utils/pagination';
import { clienteSchema, clienteCrearSchema, clienteUpdateSchema } from './clientes.schemas';
import { maxCodigoCliente } from './codigo';
import { registrarActividad } from '../../utils/actividad';
import { notificarInicioRuta } from '../../utils/notificaciones';

export const clientesRouter = Router();
clientesRouter.use(requiereAuth);

const normCiudad = (s: any) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
type ScopeCli = { rol: string; id: string; cities: string[] };
// Alcance de visibilidad de clientes. ADMIN/COADMIN -> null (ven todo).
async function scopeCliente(u: { id: string; rol: string }): Promise<ScopeCli | null> {
  if (u.rol === 'ADMIN' || u.rol === 'COADMIN') return null;
  const usr: any = await db.usuario.findUnique({ where: { id: u.id }, select: ({ regionId: true, ciudad: true } as any) });
  const set = new Set<string>();
  if (usr?.regionId) {
    try {
      const cs = await db.$queryRaw<any[]>(Prisma.sql`SELECT nombre FROM ciudades WHERE "regionId" = ${usr.regionId}`);
      for (const c of cs) set.add(normCiudad(c.nombre));
    } catch { /* sin catalogo */ }
  }
  if (usr?.ciudad) set.add(normCiudad(usr.ciudad));
  return { rol: u.rol, id: u.id, cities: [...set] };
}
function condVisibilidad(sc: ScopeCli | null) {
  if (!sc) return null;
  const cityCond = sc.cities.length
    ? Prisma.sql`trim(unaccent(upper(coalesce(ciudad,'')))) IN (${Prisma.join(sc.cities)})`
    : Prisma.sql`false`;
  if (sc.rol === 'VENDEDOR') return Prisma.sql`("creadoPorId" = ${sc.id} OR ("creadoPorId" IS NULL AND ${cityCond}))`;
  return cityCond; // supervisor: toda su region
}
function visibleCli(sc: ScopeCli | null, c: any): boolean {
  if (!sc) return true;
  const inRegion = sc.cities.includes(normCiudad(c.ciudad));
  if (sc.rol === 'VENDEDOR') return c.creadoPorId === sc.id || ((c.creadoPorId == null) && inRegion);
  return inRegion;
}

// GET /api/clientes?busqueda=&dia=&pagina=&porPagina=
clientesRouter.get('/', async (req, res, next) => {
  try {
    const { pagina, porPagina, skip, take } = leerPaginacion(req);
    // Filtros como fragmentos SQL (búsqueda insensible a mayúsculas Y tildes via unaccent).
    const cond: any[] = [Prisma.sql`activo = true`];
    if (req.query.dia) cond.push(Prisma.sql`"diaVisita" = ${Number(req.query.dia)}`);
    if (req.query.barrio) cond.push(Prisma.sql`barrio = ${String(req.query.barrio)}`);
    if (req.query.busqueda) {
      const txt = String(req.query.busqueda).trim();
      const q = `%${txt}%`;
      const n = Number(txt.replace(/\D/g, ''));
      const porCodigo = (!Number.isNaN(n) && n > 0) ? Prisma.sql` OR codigo = ${n}` : Prisma.empty;
      cond.push(Prisma.sql`(
        unaccent(coalesce(nombre,'')) ILIKE unaccent(${q})
        OR unaccent(coalesce("razonSocial",'')) ILIKE unaccent(${q})
        OR unaccent(coalesce(nit,'')) ILIKE unaccent(${q})
        OR unaccent(coalesce(barrio,'')) ILIKE unaccent(${q})
        OR unaccent(coalesce(ciudad,'')) ILIKE unaccent(${q})
        OR unaccent(coalesce(direccion,'')) ILIKE unaccent(${q})
        OR unaccent(coalesce(contacto,'')) ILIKE unaccent(${q})
        OR unaccent(coalesce(telefono,'')) ILIKE unaccent(${q})
        ${porCodigo}
      )`);
    }
    const _cv = condVisibilidad(await scopeCliente(req.usuario!));
    if (_cv) cond.push(_cv);
    const where = Prisma.join(cond, ' AND ');
    const [datos, totalRows] = await Promise.all([
      db.$queryRaw<any[]>(Prisma.sql`SELECT * FROM clientes WHERE ${where} ORDER BY nombre ASC OFFSET ${skip} LIMIT ${take}`),
      db.$queryRaw<any[]>(Prisma.sql`SELECT COUNT(*)::int AS n FROM clientes WHERE ${where}`),
    ]);
    res.json(respuestaPaginada(datos, totalRows[0]?.n ?? 0, pagina, porPagina));
  } catch (e) { next(e); }
});

// GET /api/clientes/barrios — barrios con conteo, para los chips de filtro.
// Debe ir ANTES de "/:id" para que Express no lo trate como un id.
clientesRouter.get('/barrios', async (req, res, next) => {
  try {
    const _cv = condVisibilidad(await scopeCliente(req.usuario!));
    const cc = _cv ? Prisma.sql` AND ${_cv}` : Prisma.empty;
    const dia = req.query.dia ? Prisma.sql` AND "diaVisita" = ${Number(req.query.dia)}` : Prisma.empty;
    const filas = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT barrio, COUNT(*)::int AS total FROM clientes
      WHERE activo = true AND barrio IS NOT NULL${dia}${cc}
      GROUP BY barrio ORDER BY total DESC LIMIT 100`);
    res.json(filas.map((f: any) => ({ barrio: f.barrio as string, total: f.total })));
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
    const _sc = await scopeCliente(req.usuario!);
    let clientes = await db.cliente.findMany({
      where,
      select: ({ id: true, nombre: true, codigo: true, direccion: true, barrio: true, ciudad: true, telefono: true, lat: true, lng: true, diaVisita: true, creadoPorId: true } as any),
      take: 5000,
    });
    if (_sc !== null) clientes = clientes.filter((c: any) => visibleCli(_sc, c));
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
    notificarInicioRuta(req.usuario!.id, req.params.id, 'no_compra');
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

clientesRouter.post('/', validarBody(clienteCrearSchema), async (req, res, next) => {
  try {
    // Aviso de duplicado por documento (NIT/CC).
    const nitNuevo = String(req.body.nit ?? '').trim();
    if (nitNuevo) {
      const ya: any = await db.cliente.findFirst({ where: { activo: true, nit: nitNuevo }, select: { codigo: true, nombre: true } });
      if (ya) return res.status(409).json({ error: `Ya existe un cliente con ese documento: ${ya.nombre}${ya.codigo != null ? ' (VMX-' + String(ya.codigo).padStart(4, '0') + ')' : ''}. Te recomendamos actualizar sus datos en lugar de crear uno nuevo.` });
    }
    // Al crear un cliente individual, el sistema le asigna el siguiente código VMX.
    const codigo = (await maxCodigoCliente()) + 1;
    const data: any = { ...req.body, codigo };
    // El cliente creado por una VENDEDORA queda a su nombre (solo ella lo ve).
    if (req.usuario!.rol === 'VENDEDOR') data.creadoPorId = req.usuario!.id;
    // Solo supervisor/administradores definen la tipología (y con ella la lista de precio).
    if (!['ADMIN', 'COADMIN', 'SUPERVISOR'].includes(req.usuario!.rol)) {
      delete data.tipologia; delete data.listaPrecio;
    }
    const creado = await db.cliente.create({ data });
    registrarActividad(req.usuario!.id, 'CLIENTE_NUEVO', `${(creado as any).nombre ?? ''} (#${(creado as any).codigo ?? ''})`);
    res.status(201).json(creado);
  } catch (e) { next(e); }
});

clientesRouter.put('/:id', validarBody(clienteUpdateSchema), async (req, res, next) => {
  try {
    const data: any = { ...req.body };
    delete data.codigo; // el código del cliente nunca se edita
    // La tipología (lista de precio), el NOMBRE y el DOCUMENTO (NIT) solo los cambian supervisor/administradores.
    if (!['ADMIN', 'COADMIN', 'SUPERVISOR'].includes(req.usuario!.rol)) {
      delete data.tipologia; delete data.listaPrecio; delete data.nombre; delete data.nit;
    }
    const actualizado = await db.cliente.update({ where: { id: req.params.id }, data });
    registrarActividad(req.usuario!.id, 'CLIENTE_EDIT', (actualizado as any).nombre ?? '');
    res.json(actualizado);
  } catch (e) { next(e); }
});

// Borrado lógico — solo admins. Nunca borramos datos con historial de ventas.
clientesRouter.delete('/:id', requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    await db.cliente.update({ where: { id: req.params.id }, data: { activo: false } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

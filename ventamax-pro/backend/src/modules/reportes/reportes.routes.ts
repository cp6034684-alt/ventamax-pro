import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const reportesRouter = Router();
reportesRouter.use(requiereAuth);

function rango(req: any) {
  const desde = req.query.desde ? new Date(String(req.query.desde)) : new Date(new Date().setDate(1));
  const hasta = req.query.hasta ? new Date(String(req.query.hasta) + 'T23:59:59') : new Date();
  return { desde, hasta };
}

// Traduce un periodo del dashboard (dia/semana/mes/todo) a un rango de fechas.
function rangoPeriodo(periodo: string): { desde: Date; hasta: Date } {
  const hasta = new Date();
  const desde = new Date();
  if (periodo === 'dia') {
    desde.setHours(0, 0, 0, 0);
  } else if (periodo === 'semana') {
    desde.setDate(desde.getDate() - 6);
    desde.setHours(0, 0, 0, 0);
  } else if (periodo === 'mes') {
    desde.setDate(1);
    desde.setHours(0, 0, 0, 0);
  } else {
    // todo: desde el principio de los tiempos
    desde.setTime(0);
  }
  return { desde, hasta };
}

// Día de visita en convención del negocio: 1=lunes … 7=domingo
function diaVisitaHoy(): number {
  const d = new Date().getDay(); // 0=domingo … 6=sábado
  return d === 0 ? 7 : d;
}

// GET /api/reportes/indicadores?periodo=&desde=&hasta=&vendedorId=
// KPIs comerciales: venta neta, pedidos, unidades, dropsize, efectividad,
// por vendedor, por categoría/marca y tiempo en ruta.
// El VENDEDOR solo ve los suyos; ADMIN/COADMIN/SUPERVISOR ven global o por vendedor.
reportesRouter.get('/indicadores', async (req, res, next) => {
  try {
    if (req.usuario!.rol === 'ENTREGADOR') {
      return res.status(403).json({ error: 'Sin acceso a indicadores' });
    }
    const periodo = String(req.query.periodo ?? 'mes');
    const { desde, hasta } = periodo === 'rango' ? rango(req) : rangoPeriodo(periodo);

    // Alcance por rol
    let vendedorId: string | undefined;
    if (req.usuario!.rol === 'VENDEDOR') vendedorId = req.usuario!.id;
    else if (req.query.vendedorId) vendedorId = String(req.query.vendedorId);
    const fVend = vendedorId ? Prisma.sql`AND f."vendedorId" = ${vendedorId}` : Prisma.empty;

    // Totales: venta neta, pedidos, clientes impactados
    const totRows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT COALESCE(SUM(f.total),0)::float AS venta,
             COUNT(*)::int AS pedidos,
             COUNT(DISTINCT f."clienteId")::int AS clientes
      FROM facturas f
      WHERE f.estado != 'ANULADA' AND f."creadoEn" >= ${desde} AND f."creadoEn" <= ${hasta} ${fVend}
    `);
    const tot = totRows[0] ?? { venta: 0, pedidos: 0, clientes: 0 };

    const uniRows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT COALESCE(SUM(i.cantidad),0)::int AS unidades
      FROM factura_items i JOIN facturas f ON f.id = i."facturaId"
      WHERE f.estado != 'ANULADA' AND f."creadoEn" >= ${desde} AND f."creadoEn" <= ${hasta} ${fVend}
    `);
    const unidades = uniRows[0]?.unidades ?? 0;

    // Clientes asignados (denominador de efectividad): por zona del vendedor,
    // o toda la base activa si es global o el vendedor no tiene zona.
    let asignados = 0;
    if (vendedorId) {
      const u = await db.usuario.findUnique({ where: { id: vendedorId }, select: { zona: true } });
      asignados = u?.zona
        ? await db.cliente.count({ where: { activo: true, zona: u.zona } })
        : await db.cliente.count({ where: { activo: true } });
    } else {
      asignados = await db.cliente.count({ where: { activo: true } });
    }

    const dropsize = tot.pedidos ? tot.venta / tot.pedidos : 0;
    const efectividad = asignados ? tot.clientes / asignados : 0;

    // ── Cobertura del periodo ──
    const vVend = vendedorId ? Prisma.sql`AND v."vendedorId" = ${vendedorId}` : Prisma.empty;
    // Clientes VISITADOS = compraron (ventas) ∪ no compraron (visitas con causal).
    const visRows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT COUNT(*)::int AS n FROM (
        SELECT f."clienteId" FROM facturas f
          WHERE f.estado <> 'ANULADA' AND f."tipoDoc" = 'VENTA'
            AND f."creadoEn" >= ${desde} AND f."creadoEn" <= ${hasta} ${fVend}
        UNION
        SELECT v."clienteId" FROM visitas v
          WHERE v."creadoEn" >= ${desde} AND v."creadoEn" <= ${hasta} ${vVend}
      ) t`);
    const clientesVisitados = visRows[0]?.n ?? 0;
    const ncRows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT COUNT(DISTINCT v."clienteId")::int AS n FROM visitas v
      WHERE v."creadoEn" >= ${desde} AND v."creadoEn" <= ${hasta} ${vVend}`);
    const clientesNoCompra = ncRows[0]?.n ?? 0;
    // Efectividad = clientes que compraron / clientes visitados.
    const efectividadV = clientesVisitados ? tot.clientes / clientesVisitados : 0;

    // Marcas / categorías impactadas (en las ventas del periodo).
    const impRows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT COUNT(DISTINCT p.marca) FILTER (WHERE p.marca IS NOT NULL AND p.marca <> '')::int AS marcas,
             COUNT(DISTINCT p.categoria) FILTER (WHERE p.categoria IS NOT NULL AND p.categoria <> '')::int AS categorias
      FROM factura_items i JOIN facturas f ON f.id = i."facturaId" JOIN productos p ON p.id = i."productoId"
      WHERE f.estado <> 'ANULADA' AND f."tipoDoc" = 'VENTA'
        AND f."creadoEn" >= ${desde} AND f."creadoEn" <= ${hasta} ${fVend}`);
    const marcasImpactadas = impRows[0]?.marcas ?? 0;
    const categoriasImpactadas = impRows[0]?.categorias ?? 0;

    // Clientes de la ruta de HOY (día de visita = hoy) y si el vendedor es focalizado.
    const diaHoy = diaVisitaHoy();
    let clientesRutaHoy = 0;
    let esFocalizado = false;
    if (vendedorId) {
      const yo = await db.usuario.findUnique({ where: { id: vendedorId }, select: { zona: true } });
      esFocalizado = String(yo?.zona ?? '').toUpperCase().includes('FOC');
      const whereRuta: any = { activo: true, diaVisita: diaHoy };
      if (yo?.zona) whereRuta.zona = yo.zona;
      clientesRutaHoy = await db.cliente.count({ where: whereRuta });
    } else {
      clientesRutaHoy = await db.cliente.count({ where: { activo: true, diaVisita: diaHoy } });
    }

    // Ranking por vendedor (solo vista global)
    let porVendedor: any[] = [];
    if (!vendedorId) {
      porVendedor = await db.$queryRaw<any[]>(Prisma.sql`
        SELECT f."vendedorId" AS id, u.nombre,
               COALESCE(SUM(f.total),0)::float AS venta,
               COUNT(*)::int AS pedidos,
               COUNT(DISTINCT f."clienteId")::int AS clientes
        FROM facturas f JOIN usuarios u ON u.id = f."vendedorId"
        WHERE f.estado != 'ANULADA' AND f."creadoEn" >= ${desde} AND f."creadoEn" <= ${hasta}
        GROUP BY f."vendedorId", u.nombre
        ORDER BY venta DESC
      `);
    }

    // Unidades, venta e impactos por categoría/marca
    const porCategoria = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT COALESCE(p.categoria,'Sin categoría') AS categoria,
             COALESCE(SUM(i.cantidad),0)::int AS unidades,
             COALESCE(SUM(i.total),0)::float AS venta,
             COUNT(DISTINCT f."clienteId")::int AS impactos
      FROM factura_items i
      JOIN facturas f ON f.id = i."facturaId"
      JOIN productos p ON p.id = i."productoId"
      WHERE f.estado != 'ANULADA' AND f."creadoEn" >= ${desde} AND f."creadoEn" <= ${hasta} ${fVend}
      GROUP BY categoria
      ORDER BY unidades DESC
      LIMIT 20
    `);

    // Tiempo en ruta (hora de inicio/fin y horas) — requiere vendedor
    let tiempo: any = null;
    if (vendedorId) {
      const ptos = await db.ubicacion.findMany({
        where: { vendedorId, creadoEn: { gte: desde, lte: hasta } },
        orderBy: { creadoEn: 'asc' },
        select: { creadoEn: true },
      });
      if (ptos.length) {
        const ini = ptos[0].creadoEn;
        const fin = ptos[ptos.length - 1].creadoEn;
        tiempo = {
          inicio: ini,
          fin,
          horas: Math.round(((fin.getTime() - ini.getTime()) / 3_600_000) * 10) / 10,
        };
      }
    }

    res.json({
      periodo,
      vendedorId: vendedorId ?? null,
      esFocalizado,
      totales: {
        ventaNeta: tot.venta,
        pedidos: tot.pedidos,
        unidades,
        dropsize,
        clientesImpactados: tot.clientes,
        clientesAsignados: asignados,
        clientesVisitados,
        clientesNoCompra,
        clientesRutaHoy,
        marcasImpactadas,
        categoriasImpactadas,
        efectividad: efectividadV,
        unidadesPorCliente: tot.clientes ? unidades / tot.clientes : 0,
      },
      porVendedor,
      porCategoria,
      tiempo,
    });
  } catch (e) { next(e); }
});

// GET /api/reportes/exportar-detallado?desde=&hasta= — reporte detallado completo.
// Una fila por referencia facturada (ventas y devoluciones). El costo solo
// va para ADMIN/COADMIN. El frontend arma el .xlsx con estas columnas.
reportesRouter.get('/exportar-detallado', requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const { desde, hasta } = rango(req);
    const veCosto = ['ADMIN', 'COADMIN'].includes(req.usuario!.rol);

    const facturas = await db.factura.findMany({
      where: { estado: { not: 'ANULADA' }, creadoEn: { gte: desde, lte: hasta } },
      orderBy: { creadoEn: 'asc' },
      include: {
        cliente: true,
        vendedor: ({ select: { nombre: true, documento: true, zona: true, supervisor: { select: { nombre: true } } } } as any),
        items: { include: { producto: true } },
      },
    });

    const dosDig = (n: number) => String(n).padStart(2, '0');
    // Fecha de la PRIMERA compra (venta) de cada cliente — en toda su historia, no solo el rango.
    const clienteIds = [...new Set(facturas.map((f: any) => f.clienteId))];
    const primeras = clienteIds.length
      ? await db.factura.groupBy({
          by: ['clienteId'],
          where: { clienteId: { in: clienteIds }, estado: { not: 'ANULADA' }, tipoDoc: 'VENTA' },
          _min: { creadoEn: true },
        })
      : [];
    const primeraPorCliente = new Map(primeras.map((x: any) => [x.clienteId, x._min.creadoEn as Date | null]));
    const fmtDia = (dt: Date | null) => dt ? `${dt.getFullYear()}-${dosDig(dt.getMonth() + 1)}-${dosDig(dt.getDate())}` : '';
    const filas: any[] = [];

    for (const f of facturas) {
      const d = new Date(f.creadoEn);
      const fecha = `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}-${dosDig(d.getDate())}`;
      const hora = `${dosDig(d.getHours())}:${dosDig(d.getMinutes())}:${dosDig(d.getSeconds())}`;
      const esDev = f.tipoDoc === 'DEVOLUCION';
      const c = f.cliente;
      const fechaPrimeraCompra = fmtDia(primeraPorCliente.get(f.clienteId) ?? null);

      for (const it of f.items) {
        const p: any = it.producto;
        const valorTotal = Number(it.total);
        const ivaPct = Number(p.iva ?? 0);
        const cant = it.cantidad;
        // Los precios YA incluyen IVA: se desglosa, no se suma encima.
        const baseSinIva = ivaPct > 0 ? valorTotal / (1 + ivaPct / 100) : valorTotal;
        const ivaValor = Math.round((valorTotal - baseSinIva) * 100) / 100;
        const precioUnit = Number(it.precioUnit);
        const precioSinIvaUnit = ivaPct > 0 ? precioUnit / (1 + ivaPct / 100) : precioUnit;
        const costoUnit = Number(p.precioCompra ?? 0);
        const margenUnit = precioSinIvaUnit - costoUnit;
        const r2 = (x: number) => Math.round(x * 100) / 100;
        const cc = (x: number): number | string => (veCosto ? r2(x) : '');

        filas.push({
          codigoRuta: f.vendedor?.zona ?? '',
          vendedor: f.vendedor?.nombre ?? '',
          docVendedor: f.vendedor?.documento ?? '',
          supervisor: (f.vendedor as any)?.supervisor?.nombre ?? '',
          codigoCliente: c.codigo ?? '',
          nombreCliente: c.razonSocial ?? c.nombre,
          fechaPrimeraCompra,
          nit: c.nit ?? '',
          negocio: c.nombre,
          tipologia: c.tipologia ?? '',
          ciudad: c.ciudad ?? '',
          barrio: c.barrio ?? '',
          direccion: c.direccion ?? '',
          celular: c.telefono ?? '',
          lista: c.listaPrecio ?? f.listaPrecio ?? '',
          fecha,
          hora,
          tipo: esDev ? 'DEV' : 'FAC',
          factura: f.consecutivo,
          codigoArticulo: p.codigo ?? '',
          descripcion: p.nombre,
          marca: p.marca ?? '',
          categoria: p.categoria ?? '',
          linea: p.linea ?? '',
          segmento: p.segmento ?? '',
          subsegmento: p.subsegmento ?? '',
          cantidad: it.cantidad,
          costoUnit: cc(costoUnit),
          costoMasIvaUnit: cc(costoUnit * (1 + ivaPct / 100)),
          ivaPct,
          ivaValor,
          margenUnit: cc(margenUnit),
          precioSinIvaUnit: r2(precioSinIvaUnit),
          precioConIvaUnit: r2(precioUnit),
          costoXcant: cc(costoUnit * cant),
          costoXcantMasIva: cc(costoUnit * cant * (1 + ivaPct / 100)),
          totalSinIva: r2(baseSinIva),
          totalFacturaLinea: r2(valorTotal),
          valorNota: esDev ? r2(valorTotal) : 0,
        });
      }
    }

    res.json({ desde, hasta, filas });
  } catch (e) { next(e); }
});

// GET /api/reportes/actividad?usuarioId=&tipo=&limit= — log de eventos (LOGIN/LOGOUT/VENTA/IMPORTACION)
reportesRouter.get('/actividad', requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const where: any = {};
    if (req.query.usuarioId) where.usuarioId = String(req.query.usuarioId);
    if (req.query.tipo) where.tipo = String(req.query.tipo);
    const limit = Math.min(Number(req.query.limit) || 1000, 2000);
    const eventos = await (db as any).actividad.findMany({
      where,
      orderBy: { creadoEn: 'desc' },
      take: limit,
      select: { id: true, consecutivo: true, tipo: true, detalle: true, creadoEn: true, usuario: { select: { nombre: true, zona: true, rol: true } } },
    });
    res.json(eventos.map((e: any) => ({
      id: e.id, consecutivo: e.consecutivo, tipo: e.tipo, detalle: e.detalle, creadoEn: e.creadoEn,
      nombre: e.usuario?.nombre ?? '—',
      alcance: e.usuario?.zona || (e.usuario?.rol && ['ADMIN', 'COADMIN'].includes(e.usuario.rol) ? 'Todas' : ''),
    })));
  } catch (e) { next(e); }
});

// GET /api/reportes/resumen?desde=&hasta= — agregados generales (ADMIN/COADMIN)
// Con 450k facturas/mes los reportes se calculan en la base de datos
// con agregaciones SQL — jamás descargando todo al frontend.
reportesRouter.get('/resumen', requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'), async (req, res, next) => {
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
    const esAdmin = ['ADMIN', 'COADMIN', 'SUPERVISOR'].includes(req.usuario!.rol);
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
reportesRouter.get('/cartera', requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'), async (_req, res, next) => {
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

// Paleta de colores para los avatares de asesores (igual estilo que el sistema viejo)
const COLORES_ASESOR = [
  '#00c8ff', '#00e5a0', '#ffaa00', '#c084fc', '#ff4060', '#fbbf24', '#38bdf8', '#34d399',
];

// GET /api/reportes/asesores?periodo=dia|semana|mes|todo
// Ranking de asesores (vendedores) por ventas en el periodo. Incluye a
// todos los vendedores activos, aunque tengan 0 ventas (igual que el viejo).
reportesRouter.get('/asesores', requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const periodo = String(req.query.periodo ?? 'dia');
    const { desde, hasta } = rangoPeriodo(periodo);

    const [vendedores, porVendedor] = await Promise.all([
      db.usuario.findMany({
        where: { rol: { in: ['VENDEDOR', 'COADMIN', 'SUPERVISOR'] }, activo: true },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
      db.factura.groupBy({
        by: ['vendedorId'],
        where: { creadoEn: { gte: desde, lte: hasta }, estado: { not: 'ANULADA' } },
        _sum: { total: true },
        _count: true,
      }),
    ]);

    const porId = new Map(porVendedor.map((v: any) => [v.vendedorId, v]));

    const ranking = vendedores
      .map((v: any, i: number) => {
        const agg = porId.get(v.id);
        return {
          id: v.id,
          nombre: v.nombre,
          inicial: (v.nombre.trim().charAt(0) || '?').toUpperCase(),
          color: COLORES_ASESOR[i % COLORES_ASESOR.length],
          total: Number(agg?._sum.total ?? 0),
          pedidos: agg?._count ?? 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    res.json({ periodo, ranking });
  } catch (e) { next(e); }
});


// GET /api/reportes/panel — datos del "panel de arranque" del dashboard:
// total/mi mes + % de meta, mora pendiente, ruta de hoy y clientes en riesgo.
// VENDEDOR ve lo suyo (Mi Mes, su mora, su ruta/zona); ADMIN/COADMIN/SUPERVISOR ven global.
reportesRouter.get('/panel', async (req, res, next) => {
  try {
    if (req.usuario!.rol === 'ENTREGADOR') {
      return res.status(403).json({ error: 'Sin acceso al panel' });
    }
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
    const dia = diaVisitaHoy();

    const esVend = req.usuario!.rol === 'VENDEDOR';
    const vendedorId = esVend ? req.usuario!.id : undefined;

    const yo = await db.usuario.findUnique({
      where: { id: req.usuario!.id },
      select: { meta: true, zona: true },
    });
    const meta = Number(yo?.meta ?? 10_000_000);

    const whereRuta: any = { activo: true, diaVisita: dia };
    if (esVend && yo?.zona) whereRuta.zona = yo.zona;

    const whereMes: any = { creadoEn: { gte: inicioMes }, estado: { not: 'ANULADA' } };
    if (vendedorId) whereMes.vendedorId = vendedorId;
    const whereMora: any = { estado: { in: ['PENDIENTE', 'CREDITO'] } };
    if (vendedorId) whereMora.vendedorId = vendedorId;

    const [mes, pendientes, rutaTotal, rutaClientes] = await Promise.all([
      db.factura.aggregate({
        where: whereMes,
        _sum: { total: true },
        _count: true,
      }),
      db.factura.findMany({
        where: whereMora,
        select: { total: true, pagado: true },
      }),
      db.cliente.count({ where: whereRuta }),
      db.cliente.findMany({
        where: whereRuta,
        select: { id: true, nombre: true, barrio: true, direccion: true },
        orderBy: { nombre: 'asc' },
        take: 120,
      }),
    ]);

    const pendienteTotal = pendientes.reduce(
      (s: number, f: any) => s + (Number(f.total) - Number(f.pagado)), 0);

    const ids = rutaClientes.map((c: any) => c.id);
    const whereUltimas: any = { clienteId: { in: ids }, estado: { not: 'ANULADA' } };
    if (vendedorId) whereUltimas.vendedorId = vendedorId;
    const ultimas = ids.length
      ? await db.factura.groupBy({
          by: ['clienteId'],
          where: whereUltimas,
          _max: { creadoEn: true },
        })
      : [];
    const ultimaPorCliente = new Map(
      ultimas.map((u: any) => [u.clienteId, u._max.creadoEn as Date | null]));

    const ahora = Date.now();
    const riesgo = rutaClientes
      .map((c: any) => {
        const ult = ultimaPorCliente.get(c.id) ?? null;
        const dias = ult ? Math.round((ahora - new Date(ult).getTime()) / 86_400_000) : 999;
        return { id: c.id, nombre: c.nombre, barrio: c.barrio, dias };
      })
      .filter(r => r.dias >= 7)
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 5);

    const totalMes = Number(mes._sum.total ?? 0);
    const pct = meta > 0 ? Math.min(100, Math.round((totalMes / meta) * 100)) : 0;

    res.json({
      totalMes,
      pedidosMes: mes._count,
      meta,
      pct,
      etiquetaMes: esVend ? 'Mi Mes' : 'Total Mes',
      pendiente: { total: pendienteTotal, count: pendientes.length },
      rutaHoy: {
        dia,
        total: rutaTotal,
        clientes: rutaClientes.slice(0, 5),
      },
      riesgo,
    });
  } catch (e) { next(e); }
});

// GET /api/reportes/dashboard?periodo=&desde=&hasta= — resumen histórico del inicio:
// tarjetas (venta hoy, mi mes, clientes, stock bajo), agregados del periodo
// (pedidos, venta neta, ticket, unidades, devoluciones, fiados, clientes),
// totales por método de pago e informe por categoría/producto.
// El VENDEDOR solo ve lo suyo; ADMIN/COADMIN/SUPERVISOR ven global.
reportesRouter.get('/dashboard', async (req, res, next) => {
  try {
    if (req.usuario!.rol === 'ENTREGADOR') {
      return res.status(403).json({ error: 'Sin acceso al dashboard' });
    }
    const periodo = String(req.query.periodo ?? 'todo');
    const { desde, hasta } = periodo === 'rango' ? rango(req) : rangoPeriodo(periodo);

    const esVend = req.usuario!.rol === 'VENDEDOR';
    const vendedorId = esVend ? req.usuario!.id : undefined;
    const fVend = vendedorId ? Prisma.sql`AND f."vendedorId" = ${vendedorId}` : Prisma.empty;

    const yo = await db.usuario.findUnique({ where: { id: req.usuario!.id }, select: { meta: true } });
    const meta = Number(yo?.meta ?? 10_000_000);

    const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);

    const aggRows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT
        COALESCE(SUM(f.total), 0)::float AS venta_neta,
        COUNT(*) FILTER (WHERE f."tipoDoc" = 'VENTA')::int AS pedidos,
        COUNT(*) FILTER (WHERE f."tipoDoc" = 'DEVOLUCION')::int AS devoluciones,
        COUNT(*) FILTER (WHERE f.estado = 'CREDITO')::int AS fiados,
        COALESCE(SUM(f.total) FILTER (WHERE f."metodoPago" = 'EFECTIVO'), 0)::float AS efectivo,
        COALESCE(SUM(f.total - f.pagado) FILTER (WHERE f.estado = 'CREDITO'), 0)::float AS paga_otro_dia,
        COUNT(DISTINCT f."clienteId") FILTER (WHERE f."tipoDoc" = 'VENTA')::int AS clientes_historico
      FROM facturas f
      WHERE f.estado <> 'ANULADA' AND f."creadoEn" >= ${desde} AND f."creadoEn" <= ${hasta} ${fVend}
    `);
    const a = aggRows[0] ?? {};

    const itemRows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT COALESCE(SUM(i.cantidad), 0)::int AS unidades, COALESCE(SUM(i.total), 0)::float AS monto
      FROM factura_items i JOIN facturas f ON f.id = i."facturaId"
      WHERE f.estado <> 'ANULADA' AND f."tipoDoc" = 'VENTA'
        AND f."creadoEn" >= ${desde} AND f."creadoEn" <= ${hasta} ${fVend}
    `);
    const unidades = itemRows[0]?.unidades ?? 0;
    const montoVenta = itemRows[0]?.monto ?? 0;

    const porCategoria = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT COALESCE(p.categoria, 'Sin categoría') AS nombre,
             COALESCE(SUM(i.cantidad), 0)::int AS unidades,
             COALESCE(SUM(i.total), 0)::float AS venta
      FROM factura_items i JOIN facturas f ON f.id = i."facturaId" JOIN productos p ON p.id = i."productoId"
      WHERE f.estado <> 'ANULADA' AND f."tipoDoc" = 'VENTA'
        AND f."creadoEn" >= ${desde} AND f."creadoEn" <= ${hasta} ${fVend}
      GROUP BY p.categoria ORDER BY venta DESC LIMIT 40
    `);

    const porProducto = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT p.nombre AS nombre,
             COALESCE(SUM(i.cantidad), 0)::int AS unidades,
             COALESCE(SUM(i.total), 0)::float AS venta
      FROM factura_items i JOIN facturas f ON f.id = i."facturaId" JOIN productos p ON p.id = i."productoId"
      WHERE f.estado <> 'ANULADA' AND f."tipoDoc" = 'VENTA'
        AND f."creadoEn" >= ${desde} AND f."creadoEn" <= ${hasta} ${fVend}
      GROUP BY p.id, p.nombre ORDER BY venta DESC LIMIT 60
    `);

    const hoyRows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT COALESCE(SUM(f.total), 0)::float AS total,
             COUNT(*) FILTER (WHERE f."tipoDoc" = 'VENTA')::int AS facturas
      FROM facturas f WHERE f.estado <> 'ANULADA' AND f."creadoEn" >= ${inicioHoy} ${fVend}
    `);
    const mesRows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT COALESCE(SUM(f.total), 0)::float AS total
      FROM facturas f WHERE f.estado <> 'ANULADA' AND f."creadoEn" >= ${inicioMes} ${fVend}
    `);
    const totalMes = mesRows[0]?.total ?? 0;
    const pctMeta = meta > 0 ? Math.min(100, Math.round((totalMes / meta) * 100)) : 0;

    const clientesRegistrados = await db.cliente.count({ where: { activo: true } });
    const stockRows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT COUNT(*)::int AS n FROM productos WHERE activo = true AND stock <= "stockMinimo"
    `);
    const stockBajo = stockRows[0]?.n ?? 0;

    const pedidos = a.pedidos ?? 0;
    const ventaNeta = a.venta_neta ?? 0;

    res.json({
      periodo,
      ventaHoy: { total: hoyRows[0]?.total ?? 0, facturas: hoyRows[0]?.facturas ?? 0 },
      miMes: { total: totalMes, meta, pct: pctMeta, etiqueta: esVend ? 'Mi Mes' : 'Total Mes' },
      clientesRegistrados,
      stockBajo,
      pedidos,
      ventaNeta,
      ticketProm: pedidos ? ventaNeta / pedidos : 0,
      unidades,
      montoVenta,
      clientesHistorico: a.clientes_historico ?? 0,
      devoluciones: a.devoluciones ?? 0,
      fiados: a.fiados ?? 0,
      efectivo: a.efectivo ?? 0,
      pagaOtroDia: a.paga_otro_dia ?? 0,
      porCategoria,
      porProducto,
    });
  } catch (e) { next(e); }
});

// GET /api/reportes/rentabilidad?periodo=&desde=&hasta= — venta, costo, ganancia y margen
// por producto y por categoría. El VENDEDOR ve lo suyo; gestión ve global.
reportesRouter.get('/rentabilidad', async (req, res, next) => {
  try {
    if (req.usuario!.rol === 'ENTREGADOR') {
      return res.status(403).json({ error: 'Sin acceso' });
    }
    const periodo = String(req.query.periodo ?? 'mes');
    const { desde, hasta } = periodo === 'rango' ? rango(req) : rangoPeriodo(periodo);
    const vendedorId = req.usuario!.rol === 'VENDEDOR' ? req.usuario!.id
      : (req.query.vendedorId ? String(req.query.vendedorId) : undefined);
    const fVend = vendedorId ? Prisma.sql`AND f."vendedorId" = ${vendedorId}` : Prisma.empty;

    const porProducto = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT p.nombre AS nombre,
             COALESCE(SUM(i.total / (1 + COALESCE(p.iva, 0) / 100.0)), 0)::float AS venta,
             COALESCE(SUM(p."precioCompra" * i.cantidad), 0)::float AS costo,
             COALESCE(SUM(i.cantidad), 0)::int AS unidades
      FROM factura_items i JOIN facturas f ON f.id = i."facturaId" JOIN productos p ON p.id = i."productoId"
      WHERE f.estado <> 'ANULADA' AND f."tipoDoc" = 'VENTA'
        AND f."creadoEn" >= ${desde} AND f."creadoEn" <= ${hasta} ${fVend}
      GROUP BY p.id, p.nombre ORDER BY venta DESC LIMIT 100
    `);
    const porCategoria = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT COALESCE(p.categoria, 'Sin categoría') AS nombre,
             COALESCE(SUM(i.total / (1 + COALESCE(p.iva, 0) / 100.0)), 0)::float AS venta,
             COALESCE(SUM(p."precioCompra" * i.cantidad), 0)::float AS costo,
             COALESCE(SUM(i.cantidad), 0)::int AS unidades
      FROM factura_items i JOIN facturas f ON f.id = i."facturaId" JOIN productos p ON p.id = i."productoId"
      WHERE f.estado <> 'ANULADA' AND f."tipoDoc" = 'VENTA'
        AND f."creadoEn" >= ${desde} AND f."creadoEn" <= ${hasta} ${fVend}
      GROUP BY p.categoria ORDER BY venta DESC LIMIT 40
    `);

    const venta = porProducto.reduce((s, r) => s + Number(r.venta), 0);
    const costo = porProducto.reduce((s, r) => s + Number(r.costo), 0);
    const ganancia = venta - costo;
    res.json({
      periodo,
      totales: { venta, costo, ganancia, margen: venta > 0 ? ganancia / venta : 0 },
      porProducto: porProducto.map(r => ({ ...r, ganancia: Number(r.venta) - Number(r.costo) })),
      porCategoria: porCategoria.map(r => ({ ...r, ganancia: Number(r.venta) - Number(r.costo) })),
    });
  } catch (e) { next(e); }
});

// GET /api/reportes/ejecutivo?periodo=&desde=&hasta= — Dashboard ejecutivo (KPIs + comparativos + proyeccion + alertas).
// ADMIN/COADMIN ven todo; SUPERVISOR ve su equipo (vendedores a su cargo + el mismo).
reportesRouter.get('/ejecutivo', requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    // ── Rango segun periodo ──
    const periodo = String(req.query.periodo ?? 'mes');
    const hasta = req.query.hasta ? new Date(String(req.query.hasta) + 'T23:59:59') : new Date();
    let desde = new Date();
    if (periodo === 'rango' && req.query.desde) { desde = new Date(String(req.query.desde)); }
    else if (periodo === 'semana') { desde = new Date(); desde.setDate(desde.getDate() - 6); desde.setHours(0, 0, 0, 0); }
    else if (periodo === 'trimestre') { desde = new Date(); desde.setMonth(desde.getMonth() - 2, 1); desde.setHours(0, 0, 0, 0); }
    else { desde = new Date(); desde.setDate(1); desde.setHours(0, 0, 0, 0); }

    // ── Alcance por rol (supervisor = su equipo) ──
    let scopeIds: string[] | null = null;
    if (req.usuario!.rol === 'SUPERVISOR') {
      const equipo = await db.usuario.findMany({
        where: ({ OR: [{ supervisorId: req.usuario!.id }, { id: req.usuario!.id }] } as any),
        select: { id: true },
      });
      scopeIds = equipo.map((u: any) => u.id);
      if (!scopeIds.length) scopeIds = [req.usuario!.id];
    }
    const fScope = scopeIds ? Prisma.sql`AND f."vendedorId" IN (${Prisma.join(scopeIds)})` : Prisma.empty;

    // Fragmentos base
    const baseI = (d: Date, h: Date) => Prisma.sql`f.estado <> 'ANULADA' AND f."tipoDoc" = 'VENTA' AND f."creadoEn" >= ${d} AND f."creadoEn" <= ${h} ${fScope}`;

    // Fechas auxiliares
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
    const nMeses = Math.min(Math.max(Number(req.query.meses) || 6, 1), 24);
    const hace6 = new Date(); hace6.setMonth(hace6.getMonth() - (nMeses - 1), 1); hace6.setHours(0, 0, 0, 0);
    const ahora = new Date();
    const diaActual = ahora.getDate();
    const diasMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();

    const [kpiRows, pedRows, devRows, regional, vendedor, supervisor, marca, categoria, zona, meses, diario, metaRow, mtdVend] = await Promise.all([
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT COALESCE(SUM(i.total),0)::float AS venta,
               COALESCE(SUM(i.total/(1+COALESCE(p.iva,0)/100.0)),0)::float AS ventaneta,
               COALESCE(SUM(p."precioCompra"*i.cantidad),0)::float AS costo,
               COALESCE(SUM(i.cantidad),0)::int AS unidades
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId" JOIN productos p ON p.id=i."productoId"
        WHERE ${baseI(desde, hasta)}`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT COUNT(*)::int AS pedidos, COUNT(DISTINCT f."clienteId")::int AS clientes
        FROM facturas f WHERE ${baseI(desde, hasta)}`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT COALESCE(SUM(ABS(i.total)),0)::float AS monto, COUNT(DISTINCT f.id)::int AS docs
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId"
        WHERE f.estado <> 'ANULADA' AND f."tipoDoc"='DEVOLUCION' AND f."creadoEn" >= ${desde} AND f."creadoEn" <= ${hasta} ${fScope}`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT COALESCE(r.nombre,'Sin región') AS nombre, COALESCE(SUM(i.total),0)::float AS venta, COALESCE(SUM(i.cantidad),0)::int AS unidades
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId" JOIN productos p ON p.id=i."productoId"
        JOIN usuarios u ON u.id=f."vendedorId" LEFT JOIN regiones r ON r.id=u."regionId"
        WHERE ${baseI(desde, hasta)} GROUP BY r.nombre ORDER BY venta DESC`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT u.nombre AS nombre, u.zona AS zona, COALESCE(SUM(i.total),0)::float AS venta,
               COALESCE(SUM(i.cantidad),0)::int AS unidades, COUNT(DISTINCT f.id)::int AS pedidos, MAX(u.meta)::float AS meta
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId" JOIN productos p ON p.id=i."productoId"
        JOIN usuarios u ON u.id=f."vendedorId"
        WHERE ${baseI(desde, hasta)} GROUP BY u.id, u.nombre, u.zona ORDER BY venta DESC LIMIT 60`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT COALESCE(su.nombre,'Sin supervisor') AS nombre, COALESCE(SUM(i.total),0)::float AS venta
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId" JOIN productos p ON p.id=i."productoId"
        JOIN usuarios u ON u.id=f."vendedorId" LEFT JOIN usuarios su ON su.id=u."supervisorId"
        WHERE ${baseI(desde, hasta)} GROUP BY su.nombre ORDER BY venta DESC`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT COALESCE(NULLIF(TRIM(p.marca),''),'Sin marca') AS nombre, COALESCE(SUM(i.total),0)::float AS venta, COALESCE(SUM(i.cantidad),0)::int AS unidades
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId" JOIN productos p ON p.id=i."productoId"
        WHERE ${baseI(desde, hasta)} GROUP BY 1 ORDER BY venta DESC LIMIT 30`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT COALESCE(NULLIF(TRIM(p.categoria),''),'Sin categoría') AS nombre, COALESCE(SUM(i.total),0)::float AS venta, COALESCE(SUM(i.cantidad),0)::int AS unidades
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId" JOIN productos p ON p.id=i."productoId"
        WHERE ${baseI(desde, hasta)} GROUP BY 1 ORDER BY venta DESC LIMIT 30`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT COALESCE(NULLIF(TRIM(u.zona),''),'Sin zona') AS nombre, COALESCE(SUM(i.total),0)::float AS venta
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId" JOIN productos p ON p.id=i."productoId"
        JOIN usuarios u ON u.id=f."vendedorId"
        WHERE ${baseI(desde, hasta)} GROUP BY 1 ORDER BY venta DESC LIMIT 40`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT to_char(date_trunc('month', f."creadoEn"),'YYYY-MM') AS mes, COALESCE(SUM(i.total),0)::float AS venta, COALESCE(SUM(i.cantidad),0)::int AS unidades
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId"
        WHERE f.estado <> 'ANULADA' AND f."tipoDoc"='VENTA' AND f."creadoEn" >= ${hace6} ${fScope}
        GROUP BY 1 ORDER BY 1`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT to_char(f."creadoEn",'YYYY-MM-DD') AS dia, COALESCE(SUM(i.total),0)::float AS venta
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId"
        WHERE ${baseI(desde, hasta)} GROUP BY 1 ORDER BY 1`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT COALESCE(SUM(meta),0)::float AS meta FROM usuarios
        WHERE rol='VENDEDOR' AND activo=true ${scopeIds ? Prisma.sql`AND id IN (${Prisma.join(scopeIds)})` : Prisma.empty}`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT u.id AS id, u.nombre AS nombre, COALESCE(SUM(i.total),0)::float AS venta, MAX(u.meta)::float AS meta
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId"
        JOIN usuarios u ON u.id=f."vendedorId"
        WHERE ${baseI(inicioMes, ahora)} GROUP BY u.id, u.nombre`),
    ]);

    const k = kpiRows[0] ?? {}; const ped = pedRows[0] ?? {}; const dev = devRows[0] ?? {};
    const venta = Number(k.venta || 0), ventaNeta = Number(k.ventaneta || 0), costo = Number(k.costo || 0);
    const ganancia = ventaNeta - costo;
    const pedidos = Number(ped.pedidos || 0), clientes = Number(ped.clientes || 0), unidades = Number(k.unidades || 0);

    // Proyeccion de cierre del mes en curso (ritmo diario)
    const ventaMtd = mtdVend.reduce((s: number, r: any) => s + Number(r.venta || 0), 0);
    const proyeccion = diaActual > 0 ? (ventaMtd / diaActual) * diasMes : 0;
    const metaTotal = Number(metaRow[0]?.meta || 0);

    // Alertas de venta baja (mes en curso, ritmo proyectado vs meta del vendedor)
    const vendConVenta = new Set(mtdVend.filter((r: any) => Number(r.venta) > 0).map((r: any) => r.id));
    const todosVend = await db.usuario.findMany({
      where: ({ rol: 'VENDEDOR', activo: true, ...(scopeIds ? { id: { in: scopeIds } } : {}) } as any),
      select: { id: true, nombre: true, meta: true },
    });
    const alertas: any[] = [];
    for (const v of todosVend) {
      const fila = mtdVend.find((r: any) => r.id === v.id);
      const vMtd = Number(fila?.venta || 0);
      const meta = Number((v as any).meta || 0);
      if (vMtd === 0) { alertas.push({ nombre: v.nombre, tipo: 'sin_venta', detalle: 'Sin ventas este mes', cumplimiento: 0 }); continue; }
      if (meta > 0) {
        const proy = (vMtd / diaActual) * diasMes;
        const cumpl = proy / meta;
        if (cumpl < 0.7) alertas.push({ nombre: v.nombre, tipo: 'bajo', detalle: `Proyección ${Math.round(cumpl * 100)}% de su meta`, cumplimiento: cumpl });
      }
    }
    alertas.sort((a, b) => a.cumplimiento - b.cumplimiento);

    res.json({
      rango: { desde, hasta }, periodo,
      kpis: {
        venta, ventaNeta, costo, ganancia,
        margen: ventaNeta > 0 ? ganancia / ventaNeta : 0,
        unidades, pedidos, clientes,
        ticket: pedidos > 0 ? venta / pedidos : 0,
        dropSize: pedidos > 0 ? unidades / pedidos : 0,
        devolucionesMonto: Number(dev.monto || 0), devolucionesDocs: Number(dev.docs || 0),
      },
      participacion: { regional, vendedor, supervisor, marca, categoria, zona },
      comparativos: { meses },
      seguimiento: diario,
      proyeccion: { ventaMtd, proyeccion, metaTotal, diaActual, diasMes, cumplimiento: metaTotal > 0 ? proyeccion / metaTotal : 0 },
      alertas: alertas.slice(0, 20),
    });
  } catch (e) { next(e); }
});

// GET /api/reportes/comparativo — mes en curso vs mes anterior (mismo nro de días, comparación justa).
// total + por vendedor (con impactos y pedidos) + por categoría / regional / marca. Alcance por rol.
reportesRouter.get('/comparativo', requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    let scopeIds: string[] | null = null;
    if (req.usuario!.rol === 'SUPERVISOR') {
      const equipo = await db.usuario.findMany({
        where: ({ OR: [{ supervisorId: req.usuario!.id }, { id: req.usuario!.id }] } as any),
        select: { id: true },
      });
      scopeIds = equipo.map((u: any) => u.id);
      if (!scopeIds.length) scopeIds = [req.usuario!.id];
    }
    const fScope = scopeIds ? Prisma.sql`AND f."vendedorId" IN (${Prisma.join(scopeIds)})` : Prisma.empty;

    const ahora = new Date();
    const y = ahora.getFullYear(), m = ahora.getMonth(), diaActual = ahora.getDate();
    const aDesde = new Date(y, m, 1, 0, 0, 0);
    const aHasta = ahora;
    const prev = new Date(y, m - 1, 1);
    const py = prev.getFullYear(), pm = prev.getMonth();
    const lastPrev = new Date(py, pm + 1, 0).getDate();
    const bDesde = new Date(py, pm, 1, 0, 0, 0);
    const bHasta = new Date(py, pm, Math.min(diaActual, lastPrev), 23, 59, 59);

    // Fragmentos FILTER por período
    const FA = Prisma.sql`FILTER (WHERE f."creadoEn" >= ${aDesde} AND f."creadoEn" <= ${aHasta})`;
    const FB = Prisma.sql`FILTER (WHERE f."creadoEn" >= ${bDesde} AND f."creadoEn" <= ${bHasta})`;
    // Rango total que abarca ambos períodos (para el WHERE externo)
    const ventaWhere = Prisma.sql`f.estado <> 'ANULADA' AND f."tipoDoc" = 'VENTA' AND f."creadoEn" >= ${bDesde} AND f."creadoEn" <= ${aHasta} ${fScope}`;

    const [totItems, totFact, vendedor, categoria, regional, marca] = await Promise.all([
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT
          COALESCE(SUM(i.total) ${FA},0)::float AS venta_act,
          COALESCE(SUM(i.total) ${FB},0)::float AS venta_ant,
          COALESCE(SUM(i.cantidad) ${FA},0)::int AS und_act,
          COALESCE(SUM(i.cantidad) ${FB},0)::int AS und_ant
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId"
        WHERE ${ventaWhere}`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT
          COUNT(DISTINCT f.id) ${FA}::int AS ped_act,
          COUNT(DISTINCT f.id) ${FB}::int AS ped_ant,
          COUNT(DISTINCT f."clienteId") ${FA}::int AS cli_act,
          COUNT(DISTINCT f."clienteId") ${FB}::int AS cli_ant
        FROM facturas f WHERE ${ventaWhere}`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT u.nombre AS nombre, u.zona AS zona,
          COALESCE(SUM(i.total) ${FA},0)::float AS venta_act,
          COALESCE(SUM(i.total) ${FB},0)::float AS venta_ant,
          COALESCE(SUM(i.cantidad) ${FA},0)::int AS und_act,
          COALESCE(SUM(i.cantidad) ${FB},0)::int AS und_ant,
          COUNT(DISTINCT f.id) ${FA}::int AS ped_act,
          COUNT(DISTINCT f.id) ${FB}::int AS ped_ant,
          COUNT(DISTINCT f."clienteId") ${FA}::int AS cli_act,
          COUNT(DISTINCT f."clienteId") ${FB}::int AS cli_ant
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId" JOIN usuarios u ON u.id=f."vendedorId"
        WHERE ${ventaWhere} GROUP BY u.id, u.nombre, u.zona
        ORDER BY venta_act DESC LIMIT 60`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT COALESCE(NULLIF(TRIM(p.categoria),''),'Sin categoría') AS nombre,
          COALESCE(SUM(i.total) ${FA},0)::float AS venta_act,
          COALESCE(SUM(i.total) ${FB},0)::float AS venta_ant
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId" JOIN productos p ON p.id=i."productoId"
        WHERE ${ventaWhere} GROUP BY 1 ORDER BY venta_act DESC LIMIT 30`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT COALESCE(r.nombre,'Sin región') AS nombre,
          COALESCE(SUM(i.total) ${FA},0)::float AS venta_act,
          COALESCE(SUM(i.total) ${FB},0)::float AS venta_ant
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId" JOIN productos p ON p.id=i."productoId"
        JOIN usuarios u ON u.id=f."vendedorId" LEFT JOIN regiones r ON r.id=u."regionId"
        WHERE ${ventaWhere} GROUP BY r.nombre ORDER BY venta_act DESC`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT COALESCE(NULLIF(TRIM(p.marca),''),'Sin marca') AS nombre,
          COALESCE(SUM(i.total) ${FA},0)::float AS venta_act,
          COALESCE(SUM(i.total) ${FB},0)::float AS venta_ant
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId" JOIN productos p ON p.id=i."productoId"
        WHERE ${ventaWhere} GROUP BY 1 ORDER BY venta_act DESC LIMIT 30`),
    ]);

    const ti = totItems[0] ?? {}; const tf = totFact[0] ?? {};
    const num = (v: any) => Number(v || 0);
    const mapDim = (rows: any[]) => rows.map(r => ({ nombre: r.nombre, ventaAct: num(r.venta_act), ventaAnt: num(r.venta_ant) }));

    res.json({
      actualLabel: `${MES_CORTO[m]} ${y}`,
      anteriorLabel: `${MES_CORTO[pm]} ${py}`,
      diaActual, diasComparados: Math.min(diaActual, lastPrev),
      total: {
        ventaAct: num(ti.venta_act), ventaAnt: num(ti.venta_ant),
        undAct: num(ti.und_act), undAnt: num(ti.und_ant),
        pedAct: num(tf.ped_act), pedAnt: num(tf.ped_ant),
        cliAct: num(tf.cli_act), cliAnt: num(tf.cli_ant),
      },
      vendedor: vendedor.map(r => ({
        nombre: r.nombre, zona: r.zona,
        ventaAct: num(r.venta_act), ventaAnt: num(r.venta_ant),
        undAct: num(r.und_act), undAnt: num(r.und_ant),
        pedAct: num(r.ped_act), pedAnt: num(r.ped_ant),
        cliAct: num(r.cli_act), cliAnt: num(r.cli_ant),
      })),
      categoria: mapDim(categoria), regional: mapDim(regional), marca: mapDim(marca),
    });
  } catch (e) { next(e); }
});

// GET /api/reportes/cartera-detalle — cartera por cliente con facturas fiadas, items y días de mora.
reportesRouter.get('/cartera-detalle', requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    let scopeIds: string[] | null = null;
    if (req.usuario!.rol === 'SUPERVISOR') {
      const equipo = await db.usuario.findMany({
        where: ({ OR: [{ supervisorId: req.usuario!.id }, { id: req.usuario!.id }] } as any),
        select: { id: true },
      });
      scopeIds = equipo.map((u: any) => u.id);
      if (!scopeIds.length) scopeIds = [req.usuario!.id];
    }
    const where: any = { metodoPago: 'CREDITO', estado: { not: 'ANULADA' } };
    if (scopeIds) where.vendedorId = { in: scopeIds };

    const facturas = await db.factura.findMany({
      where, orderBy: { creadoEn: 'asc' }, take: 6000,
      include: ({
        cliente: { select: { id: true, nombre: true, nit: true, direccion: true, barrio: true, ciudad: true, zona: true, telefono: true } },
        vendedor: { select: { nombre: true, telefono: true, zona: true } },
        items: { include: { producto: { select: { nombre: true, categoria: true, iva: true } } } },
      } as any),
    });

    const hoy = new Date();
    const dias = (d: Date) => Math.max(0, Math.floor((hoy.getTime() - new Date(d).getTime()) / 86400000));
    const porCliente = new Map<string, any>();
    let total = 0;

    for (const f of facturas as any[]) {
      const saldo = Number(f.total) - Number(f.pagado);
      if (saldo <= 0) continue;
      total += saldo;
      const cid = f.cliente?.id ?? f.clienteId;
      if (!porCliente.has(cid)) {
        porCliente.set(cid, {
          id: cid, nombre: f.cliente?.nombre ?? '—', nit: f.cliente?.nit ?? '',
          barrio: f.cliente?.barrio ?? '', telefono: f.cliente?.telefono ?? '',
          direccion: f.cliente?.direccion ?? '', ciudad: f.cliente?.ciudad ?? '',
          vendedor: f.vendedor?.nombre ?? '', saldo: 0, diasMoraMax: 0, facturas: [],
        });
      }
      const c = porCliente.get(cid);
      const dm = dias(f.creadoEn);
      c.saldo += saldo;
      c.diasMoraMax = Math.max(c.diasMoraMax, dm);
      c.facturas.push({ ...f, saldo, diasMora: dm });
    }

    const clientes = [...porCliente.values()].sort((a, b) => b.saldo - a.saldo);
    res.json({ total, clientes, totalClientes: clientes.length, totalFacturas: facturas.length });
  } catch (e) { next(e); }
});

// Alcance por rol reutilizable para los endpoints del dashboard.
async function scopeVendedores(req: any): Promise<string[] | null> {
  if (req.usuario.rol !== 'SUPERVISOR') return null;
  const equipo = await db.usuario.findMany({
    where: ({ OR: [{ supervisorId: req.usuario.id }, { id: req.usuario.id }] } as any),
    select: { id: true },
  });
  const ids = equipo.map((u: any) => u.id);
  return ids.length ? ids : [req.usuario.id];
}

// GET /api/reportes/meses-disponibles — meses con ventas (para el selector multi-mes).
reportesRouter.get('/meses-disponibles', requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const scope = await scopeVendedores(req);
    const fScope = scope ? Prisma.sql`AND f."vendedorId" IN (${Prisma.join(scope)})` : Prisma.empty;
    const rows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT to_char(f."creadoEn",'YYYY-MM') AS mes
      FROM facturas f
      WHERE f.estado <> 'ANULADA' AND f."tipoDoc"='VENTA' ${fScope}
      GROUP BY 1 ORDER BY 1 DESC LIMIT 36`);
    res.json(rows.map(r => r.mes).filter(Boolean));
  } catch (e) { next(e); }
});

// GET /api/reportes/comparar-meses?meses=YYYY-MM,YYYY-MM — comparación de meses arbitrarios.
reportesRouter.get('/comparar-meses', requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    let meses = String(req.query.meses ?? '').split(',').map(s => s.trim()).filter(s => /^\d{4}-\d{2}$/.test(s)).slice(0, 6);
    if (!meses.length) { // por defecto, últimos 3 meses
      const d = new Date();
      for (let i = 2; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); meses.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`); }
    }
    const scope = await scopeVendedores(req);
    const fScope = scope ? Prisma.sql`AND f."vendedorId" IN (${Prisma.join(scope)})` : Prisma.empty;
    const inMeses = Prisma.sql`to_char(f."creadoEn",'YYYY-MM') IN (${Prisma.join(meses)})`;
    const baseI = Prisma.sql`f.estado <> 'ANULADA' AND f."tipoDoc"='VENTA' AND ${inMeses} ${fScope}`;

    const [kpiItems, kpiFact, serie, dMarca, dCategoria, dRegional, dVendedor] = await Promise.all([
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT to_char(f."creadoEn",'YYYY-MM') AS mes, COALESCE(SUM(i.total),0)::float AS venta, COALESCE(SUM(i.cantidad),0)::int AS unidades
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId"
        WHERE ${baseI} GROUP BY 1`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT to_char(f."creadoEn",'YYYY-MM') AS mes, COUNT(DISTINCT f.id)::int AS pedidos, COUNT(DISTINCT f."clienteId")::int AS clientes
        FROM facturas f WHERE ${baseI} GROUP BY 1`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT to_char(f."creadoEn",'YYYY-MM') AS mes, EXTRACT(DAY FROM f."creadoEn")::int AS dia, COALESCE(SUM(i.total),0)::float AS venta
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId"
        WHERE ${baseI} GROUP BY 1,2 ORDER BY 2`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT COALESCE(NULLIF(TRIM(p.marca),''),'Sin marca') AS nombre, to_char(f."creadoEn",'YYYY-MM') AS mes, COALESCE(SUM(i.total),0)::float AS venta
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId" JOIN productos p ON p.id=i."productoId" WHERE ${baseI} GROUP BY 1,2`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT COALESCE(NULLIF(TRIM(p.categoria),''),'Sin categoría') AS nombre, to_char(f."creadoEn",'YYYY-MM') AS mes, COALESCE(SUM(i.total),0)::float AS venta
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId" JOIN productos p ON p.id=i."productoId" WHERE ${baseI} GROUP BY 1,2`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT COALESCE(r.nombre,'Sin región') AS nombre, to_char(f."creadoEn",'YYYY-MM') AS mes, COALESCE(SUM(i.total),0)::float AS venta
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId" JOIN usuarios u ON u.id=f."vendedorId" LEFT JOIN regiones r ON r.id=u."regionId" WHERE ${baseI} GROUP BY 1,2`),
      db.$queryRaw<any[]>(Prisma.sql`
        SELECT u.nombre AS nombre, to_char(f."creadoEn",'YYYY-MM') AS mes, COALESCE(SUM(i.total),0)::float AS venta
        FROM factura_items i JOIN facturas f ON f.id=i."facturaId" JOIN usuarios u ON u.id=f."vendedorId" WHERE ${baseI} GROUP BY 1,2`),
    ]);

    const MES_CORTO2 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const label = (m: string) => { const [y, mm] = m.split('-'); return `${MES_CORTO2[Number(mm) - 1]} ${y.slice(2)}`; };
    const kI = new Map(kpiItems.map(r => [r.mes, r])); const kF = new Map(kpiFact.map(r => [r.mes, r]));
    const kpis = meses.map(m => ({
      mes: m, label: label(m),
      venta: Number(kI.get(m)?.venta || 0), unidades: Number(kI.get(m)?.unidades || 0),
      pedidos: Number(kF.get(m)?.pedidos || 0), clientes: Number(kF.get(m)?.clientes || 0),
    }));

    // series diarias por mes (para líneas múltiples)
    const series: Record<string, { dia: number; venta: number }[]> = {};
    for (const m of meses) series[m] = [];
    for (const r of serie) series[r.mes]?.push({ dia: Number(r.dia), venta: Number(r.venta) });

    // pivot de dimensiones: [{nombre, total, valores:{mes:venta}}]
    const pivot = (rows: any[], top = 12) => {
      const map = new Map<string, { nombre: string; total: number; valores: Record<string, number> }>();
      for (const r of rows) {
        if (!map.has(r.nombre)) map.set(r.nombre, { nombre: r.nombre, total: 0, valores: {} });
        const o = map.get(r.nombre)!; o.valores[r.mes] = Number(r.venta); o.total += Number(r.venta);
      }
      return [...map.values()].sort((a, b) => b.total - a.total).slice(0, top);
    };

    res.json({
      meses, labels: meses.map(label), kpis, series,
      dimensiones: { marca: pivot(dMarca), categoria: pivot(dCategoria), regional: pivot(dRegional, 20), vendedor: pivot(dVendedor, 20) },
    });
  } catch (e) { next(e); }
});

// GET /api/reportes/exportar-facturas?desde=&hasta= — filas planas para Excel (máx 10.000)
reportesRouter.get('/exportar-facturas', requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'), async (req, res, next) => {
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

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
        vendedor: { select: { nombre: true, documento: true, zona: true } },
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
        // Los precios YA incluyen IVA: se desglosa, no se suma encima.
        const baseSinIva = ivaPct > 0 ? valorTotal / (1 + ivaPct / 100) : valorTotal;
        const ivaValor = Math.round((valorTotal - baseSinIva) * 100) / 100;
        const costoUnit = Number(p.precioCompra ?? 0);

        filas.push({
          codigoRuta: f.vendedor?.zona ?? '',
          vendedor: f.vendedor?.nombre ?? '',
          docVendedor: f.vendedor?.documento ?? '',
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
          costo: veCosto ? Math.round(costoUnit * it.cantidad * 100) / 100 : '',
          valorUnitario: Number(it.precioUnit),
          valorTotal,
          ivaPct,
          ivaValor,
          valorConIva: valorTotal,
          totalFactura: Number(f.total),
          valorNota: esDev ? valorTotal : 0,
        });
      }
    }

    res.json({ desde, hasta, filas });
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
             COALESCE(SUM(i.total), 0)::float AS venta,
             COALESCE(SUM(p."precioCompra" * i.cantidad), 0)::float AS costo,
             COALESCE(SUM(i.cantidad), 0)::int AS unidades
      FROM factura_items i JOIN facturas f ON f.id = i."facturaId" JOIN productos p ON p.id = i."productoId"
      WHERE f.estado <> 'ANULADA' AND f."tipoDoc" = 'VENTA'
        AND f."creadoEn" >= ${desde} AND f."creadoEn" <= ${hasta} ${fVend}
      GROUP BY p.id, p.nombre ORDER BY venta DESC LIMIT 100
    `);
    const porCategoria = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT COALESCE(p.categoria, 'Sin categoría') AS nombre,
             COALESCE(SUM(i.total), 0)::float AS venta,
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

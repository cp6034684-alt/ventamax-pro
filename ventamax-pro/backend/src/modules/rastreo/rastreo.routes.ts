import { Router } from 'express';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';
import { online, metros, ROLES_CAMPO } from '../presencia/presencia.store';


// Límites del día en hora de Colombia (UTC-5, sin horario de verano), para que
// "hoy" no incluya el recorrido de ayer ni se corte la operación de la tarde.
function diaColombia(fecha?: string) {
  let y: number, mo: number, d: number;
  if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [a, b, c] = fecha.split('-').map(Number); y = a; mo = b; d = c;
  } else {
    const co = new Date(Date.now() - 5 * 3600 * 1000);
    y = co.getUTCFullYear(); mo = co.getUTCMonth() + 1; d = co.getUTCDate();
  }
  const inicio = new Date(Date.UTC(y, mo - 1, d, 5, 0, 0, 0)); // 00:00 Colombia = 05:00 UTC
  const fin = new Date(inicio.getTime() + 24 * 3600 * 1000);
  return { inicio, fin };
}

export const rastreoRouter = Router();
// Rastreo solo para perfiles administrativos.
rastreoRouter.use(requiereAuth, requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'));

// GET /api/rastreo/vendedores — lista para el selector (vendedores y supervisores)
rastreoRouter.get('/vendedores', async (_req, res, next) => {
  try {
    const v = await db.usuario.findMany({
      where: { rol: { in: ROLES_CAMPO as any }, activo: true },
      select: { id: true, nombre: true, rol: true, zona: true },
      orderBy: { nombre: 'asc' },
    });
    res.json(v);
  } catch (e) { next(e); }
});

// GET /api/rastreo/vivo — posiciones en vivo de quienes están en línea ahora
rastreoRouter.get('/vivo', (_req, res) => {
  const ahora = Date.now();
  const lista = online()
    .filter(l => ROLES_CAMPO.includes(l.rol) && l.lat != null && l.lng != null)
    .map(l => ({
      id: l.id,
      nombre: l.nombre,
      rol: l.rol,
      lat: l.lat,
      lng: l.lng,
      haceSegundos: Math.round((ahora - l.ultimoLatido) / 1000),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  res.json(lista);
});

// GET /api/rastreo/recorrido?vendedorId=&fecha=YYYY-MM-DD — trayecto del día
rastreoRouter.get('/recorrido', async (req, res, next) => {
  try {
    const vendedorId = String(req.query.vendedorId || '');
    if (!vendedorId) return res.status(400).json({ error: 'vendedorId requerido' });

    const { inicio, fin } = diaColombia(req.query.fecha ? String(req.query.fecha) : undefined);

    const puntos = await db.ubicacion.findMany({
      where: { vendedorId, creadoEn: { gte: inicio, lt: fin } },
      orderBy: { creadoEn: 'asc' },
      select: { lat: true, lng: true, creadoEn: true },
    });

    let metrosTot = 0;
    for (let i = 1; i < puntos.length; i++) {
      metrosTot += metros(puntos[i - 1].lat, puntos[i - 1].lng, puntos[i].lat, puntos[i].lng);
    }

    // Operaciones del día: ventas y visitas (no-compra), ubicadas donde está el cliente.
    const [ventas, visitas] = await Promise.all([
      db.factura.findMany({
        where: { vendedorId, creadoEn: { gte: inicio, lt: fin }, estado: { not: 'ANULADA' }, tipoDoc: 'VENTA' },
        orderBy: { creadoEn: 'asc' },
        select: { creadoEn: true, total: true, clienteId: true, items: { select: { cantidad: true } } },
      }),
      db.visita.findMany({
        where: { vendedorId, creadoEn: { gte: inicio, lt: fin } },
        orderBy: { creadoEn: 'asc' },
        select: { creadoEn: true, causal: true, clienteId: true },
      }),
    ]);
    const cliIds = [...new Set([...ventas.map((v) => v.clienteId), ...visitas.map((v) => v.clienteId)])];
    const clientes = cliIds.length
      ? await db.cliente.findMany({ where: { id: { in: cliIds } }, select: { id: true, nombre: true, lat: true, lng: true, direccion: true, barrio: true } })
      : [];
    const cliMap = new Map(clientes.map((c) => [c.id, c]));
    const ubic = (c: any) => [c?.direccion, c?.barrio].filter(Boolean).join(', ');
    const operaciones: any[] = [];
    for (const v of ventas) {
      const c = cliMap.get(v.clienteId);
      if (!c?.lat || !c?.lng) continue;
      operaciones.push({
        tipo: 'venta', lat: c.lat, lng: c.lng, hora: v.creadoEn, cliente: c.nombre,
        total: Number(v.total), refs: v.items.length,
        unidades: v.items.reduce((acc, it) => acc + it.cantidad, 0), direccion: ubic(c),
      });
    }
    for (const vi of visitas) {
      const c = cliMap.get(vi.clienteId);
      if (!c?.lat || !c?.lng) continue;
      operaciones.push({ tipo: 'visita', lat: c.lat, lng: c.lng, hora: vi.creadoEn, cliente: c.nombre, causal: vi.causal, direccion: ubic(c) });
    }

    res.json({
      puntos,
      operaciones,
      resumen: {
        puntos: puntos.length,
        inicio: puntos[0]?.creadoEn ?? null,
        fin: puntos[puntos.length - 1]?.creadoEn ?? null,
        distanciaKm: Math.round(metrosTot / 100) / 10,
        ventas: ventas.length,
        visitas: visitas.length,
      },
    });
  } catch (e) { next(e); }
});

// GET /api/rastreo/recorridos?fecha=YYYY-MM-DD — recorrido del día de TODOS los vendedores (para verlos juntos)
rastreoRouter.get('/recorridos', async (req, res, next) => {
  try {
    const { inicio, fin } = diaColombia(req.query.fecha ? String(req.query.fecha) : undefined);

    const vendedores = await db.usuario.findMany({
      where: { rol: { in: ROLES_CAMPO as any }, activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    });
    const ids = vendedores.map((v) => v.id);
    if (!ids.length) return res.json([]);

    const [ubics, ventas, visitas] = await Promise.all([
      db.ubicacion.findMany({ where: { vendedorId: { in: ids }, creadoEn: { gte: inicio, lt: fin } }, orderBy: { creadoEn: 'asc' }, select: { vendedorId: true, lat: true, lng: true, creadoEn: true } }),
      db.factura.findMany({ where: { vendedorId: { in: ids }, creadoEn: { gte: inicio, lt: fin }, estado: { not: 'ANULADA' }, tipoDoc: 'VENTA' }, orderBy: { creadoEn: 'asc' }, select: { vendedorId: true, creadoEn: true, total: true, clienteId: true, items: { select: { cantidad: true } } } }),
      db.visita.findMany({ where: { vendedorId: { in: ids }, creadoEn: { gte: inicio, lt: fin } }, orderBy: { creadoEn: 'asc' }, select: { vendedorId: true, creadoEn: true, causal: true, clienteId: true } }),
    ]);
    const cliIds = [...new Set([...ventas.map((v) => v.clienteId), ...visitas.map((v) => v.clienteId)])];
    const clientes = cliIds.length
      ? await db.cliente.findMany({ where: { id: { in: cliIds } }, select: { id: true, nombre: true, lat: true, lng: true, direccion: true, barrio: true } })
      : [];
    const cliMap = new Map(clientes.map((c) => [c.id, c]));
    const ubic = (c: any) => [c?.direccion, c?.barrio].filter(Boolean).join(', ');

    const porVend = new Map<string, { nombre: string; puntos: any[]; operaciones: any[] }>();
    for (const v of vendedores) porVend.set(v.id, { nombre: v.nombre, puntos: [], operaciones: [] });
    for (const u of ubics) porVend.get(u.vendedorId)?.puntos.push({ lat: u.lat, lng: u.lng, creadoEn: u.creadoEn });
    for (const v of ventas) {
      const c = cliMap.get(v.clienteId); if (!c?.lat || !c?.lng) continue;
      porVend.get(v.vendedorId)?.operaciones.push({ tipo: 'venta', lat: c.lat, lng: c.lng, hora: v.creadoEn, cliente: c.nombre, total: Number(v.total), refs: v.items.length, unidades: v.items.reduce((a, it) => a + it.cantidad, 0), direccion: ubic(c) });
    }
    for (const vi of visitas) {
      const c = cliMap.get(vi.clienteId); if (!c?.lat || !c?.lng) continue;
      porVend.get(vi.vendedorId)?.operaciones.push({ tipo: 'visita', lat: c.lat, lng: c.lng, hora: vi.creadoEn, cliente: c.nombre, causal: vi.causal, direccion: ubic(c) });
    }

    const out = vendedores
      .map((v) => ({ vendedorId: v.id, ...porVend.get(v.id)! }))
      .filter((r) => r.puntos.length || r.operaciones.length);
    res.json(out);
  } catch (e) { next(e); }
});

import { Router } from 'express';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';
import { online, metros, ROLES_CAMPO } from '../presencia/presencia.store';

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

    const base = req.query.fecha ? new Date(String(req.query.fecha)) : new Date();
    const inicio = new Date(base); inicio.setHours(0, 0, 0, 0);
    const fin = new Date(inicio); fin.setDate(fin.getDate() + 1);

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

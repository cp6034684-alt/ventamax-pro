import { Router } from 'express';
import { db } from '../../config/db';
import { requiereAuth } from '../../middleware/auth';
import { env } from '../../config/env';
import { enviarResumenSupervisores } from '../../utils/notificaciones';

export const notificacionesRouter = Router();
notificacionesRouter.use(requiereAuth);

// GET /api/notificaciones — las del usuario actual (ultimas 50) + no leidas
notificacionesRouter.get('/', async (req, res, next) => {
  try {
    const items = await (db as any).notificacion.findMany({
      where: { usuarioId: req.usuario!.id },
      orderBy: { creadoEn: 'desc' }, take: 50,
    });
    const noLeidas = items.filter((n: any) => !n.leida).length;
    res.json({ items, noLeidas });
  } catch (e) { next(e); }
});

// PATCH /api/notificaciones/:id/leer
notificacionesRouter.patch('/:id/leer', async (req, res, next) => {
  try {
    await (db as any).notificacion.updateMany({ where: { id: req.params.id, usuarioId: req.usuario!.id }, data: { leida: true } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/notificaciones/leer-todas
notificacionesRouter.post('/leer-todas', async (req, res, next) => {
  try {
    await (db as any).notificacion.updateMany({ where: { usuarioId: req.usuario!.id, leida: false }, data: { leida: true } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});


// ── Router con token para la tarea programada (10am, 12m, 4pm). No requiere login. ──
export const notificacionesAutoRouter = Router();
notificacionesAutoRouter.post('/resumen-supervisores', (req, res, next) => {
  const tok = String(req.headers['x-import-token'] ?? '').trim();
  const real = String(env.IMPORT_TOKEN ?? '').trim();
  if (!real || tok !== real) return res.status(401).json({ error: 'Token invalido' });
  next();
}, async (_req, res, next) => {
  try { res.json(await enviarResumenSupervisores()); } catch (e) { next(e); }
});

import { Router } from 'express';
import { db } from '../../config/db';
import { requiereAuth } from '../../middleware/auth';

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

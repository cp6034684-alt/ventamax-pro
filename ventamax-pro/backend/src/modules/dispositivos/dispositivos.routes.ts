import { Router } from 'express';
import { db } from '../../config/db';
import { requiereAuth } from '../../middleware/auth';

export const dispositivosRouter = Router();
dispositivosRouter.use(requiereAuth);

// POST /api/dispositivos — registra/actualiza el token de push del dispositivo actual.
dispositivosRouter.post('/', async (req, res, next) => {
  try {
    const token = String(req.body?.token ?? '').trim();
    if (!token) return res.status(400).json({ error: 'Falta token' });
    const plataforma = req.body?.plataforma ? String(req.body.plataforma) : null;
    await (db as any).dispositivo.upsert({
      where: { token },
      update: { usuarioId: req.usuario!.id, plataforma },
      create: { usuarioId: req.usuario!.id, token, plataforma },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /api/dispositivos — quita el token (al cerrar sesión).
dispositivosRouter.delete('/', async (req, res, next) => {
  try {
    const token = String(req.body?.token ?? '').trim();
    if (token) await (db as any).dispositivo.deleteMany({ where: { token, usuarioId: req.usuario!.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

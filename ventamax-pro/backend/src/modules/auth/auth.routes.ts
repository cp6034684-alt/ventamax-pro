import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../../config/db';
import { requiereAuth } from '../../middleware/auth';
import { validarBody } from '../../middleware/validate';
import { loginSchema } from './auth.schemas';
import * as servicio from './auth.service';

export const authRouter = Router();

// POST /api/auth/login — { usuario, pin } → { token, usuario }
authRouter.post('/login', validarBody(loginSchema), async (req, res, next) => {
  try {
    const resultado = await servicio.login(req.body.usuario, req.body.pin);
    if (!resultado) return res.status(401).json({ error: 'Usuario o PIN incorrecto' });
    res.json(resultado);
  } catch (e) { next(e); }
});

// GET /api/auth/yo — datos del usuario autenticado
authRouter.get('/yo', requiereAuth, async (req, res, next) => {
  try {
    const u = await db.usuario.findUnique({
      where: { id: req.usuario!.id },
      select: { id: true, nombre: true, usuario: true, rol: true, zona: true, listasPrecios: true, creadoEn: true },
    });
    res.json(u);
  } catch (e) { next(e); }
});

// PATCH /api/auth/mi-pin — cambiar el propio PIN (exige el actual)
const cambioPinSchema = z.object({
  pinActual: z.string().regex(/^\d{4,6}$/),
  pinNuevo: z.string().regex(/^\d{4,6}$/, 'El PIN nuevo debe tener entre 4 y 6 dígitos'),
});
authRouter.patch('/mi-pin', requiereAuth, validarBody(cambioPinSchema), async (req, res, next) => {
  try {
    const u = await db.usuario.findUnique({ where: { id: req.usuario!.id } });
    if (!u || !(await bcrypt.compare(req.body.pinActual, u.pinHash))) {
      return res.status(401).json({ error: 'El PIN actual no es correcto' });
    }
    await db.usuario.update({
      where: { id: u.id },
      data: { pinHash: await bcrypt.hash(req.body.pinNuevo, 10) },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

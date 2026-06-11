import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';
import { validarBody } from '../../middleware/validate';

const usuarioSchema = z.object({
  nombre: z.string().min(1),
  usuario: z.string().min(3),
  pin: z.string().regex(/^\d{4,6}$/),
  rol: z.enum(['ADMIN', 'COADMIN', 'VENDEDOR', 'ENTREGADOR']),
  zona: z.string().optional(),
});

export const usuariosRouter = Router();
usuariosRouter.use(requiereAuth, requiereRol('ADMIN', 'COADMIN'));

usuariosRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await db.usuario.findMany({
      select: { id: true, nombre: true, usuario: true, rol: true, zona: true, activo: true, creadoEn: true },
      orderBy: { nombre: 'asc' },
    }));
  } catch (e) { next(e); }
});

usuariosRouter.post('/', validarBody(usuarioSchema), async (req, res, next) => {
  try {
    const { pin, ...resto } = req.body;
    const u = await db.usuario.create({
      data: { ...resto, pinHash: await bcrypt.hash(pin, 10) },
      select: { id: true, nombre: true, usuario: true, rol: true },
    });
    res.status(201).json(u);
  } catch (e) { next(e); }
});

usuariosRouter.patch('/:id', async (req, res, next) => {
  try {
    const data: any = {};
    if (req.body.pin) data.pinHash = await bcrypt.hash(req.body.pin, 10);
    if (req.body.activo !== undefined) data.activo = req.body.activo;
    if (req.body.zona !== undefined) data.zona = req.body.zona;
    if (req.body.rol) data.rol = req.body.rol;
    res.json(await db.usuario.update({
      where: { id: req.params.id }, data,
      select: { id: true, nombre: true, rol: true, activo: true },
    }));
  } catch (e) { next(e); }
});

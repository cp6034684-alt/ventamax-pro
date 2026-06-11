import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';
import { validarBody } from '../../middleware/validate';

const proveedorSchema = z.object({
  nombre: z.string().min(1),
  nit: z.string().optional(),
  telefono: z.string().optional(),
  contacto: z.string().optional(),
});

export const proveedoresRouter = Router();
proveedoresRouter.use(requiereAuth, requiereRol('ADMIN', 'COADMIN'));

proveedoresRouter.get('/', async (req, res, next) => {
  try {
    const where: any = { activo: true };
    if (req.query.busqueda) {
      where.nombre = { contains: String(req.query.busqueda), mode: 'insensitive' };
    }
    res.json(await db.proveedor.findMany({ where, orderBy: { nombre: 'asc' } }));
  } catch (e) { next(e); }
});

proveedoresRouter.post('/', validarBody(proveedorSchema), async (req, res, next) => {
  try {
    res.status(201).json(await db.proveedor.create({ data: req.body }));
  } catch (e) { next(e); }
});

proveedoresRouter.put('/:id', validarBody(proveedorSchema.partial()), async (req, res, next) => {
  try {
    res.json(await db.proveedor.update({ where: { id: req.params.id }, data: req.body }));
  } catch (e) { next(e); }
});

proveedoresRouter.delete('/:id', async (req, res, next) => {
  try {
    await db.proveedor.update({ where: { id: req.params.id }, data: { activo: false } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';
import { validarBody } from '../../middleware/validate';

// ── Regiones ──────────────────────────────────────────────
export const regionesRouter = Router();
regionesRouter.use(requiereAuth);

const regionSchema = z.object({ nombre: z.string().min(1) });

// Listar regiones (cualquier usuario autenticado puede leerlas para selectores)
regionesRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await db.region.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { bodegas: true } } },
    }));
  } catch (e) { next(e); }
});

regionesRouter.post('/', requiereRol('ADMIN', 'COADMIN'), validarBody(regionSchema), async (req, res, next) => {
  try {
    res.status(201).json(await db.region.create({ data: { nombre: req.body.nombre } }));
  } catch (e) { next(e); }
});

regionesRouter.patch('/:id', requiereRol('ADMIN', 'COADMIN'), async (req, res, next) => {
  try {
    const data: any = {};
    if (req.body.nombre) data.nombre = req.body.nombre;
    if (req.body.activo !== undefined) data.activo = req.body.activo;
    res.json(await db.region.update({ where: { id: req.params.id }, data }));
  } catch (e) { next(e); }
});

// ── Bodegas ───────────────────────────────────────────────
export const bodegasRouter = Router();
bodegasRouter.use(requiereAuth);

const bodegaSchema = z.object({
  nombre: z.string().min(1),
  codigo: z.string().optional(),
  ciudad: z.string().optional(),
  direccion: z.string().optional(),
  regionId: z.string().uuid().optional(),
});

bodegasRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await db.bodega.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      include: { region: { select: { id: true, nombre: true } } },
    }));
  } catch (e) { next(e); }
});

bodegasRouter.post('/', requiereRol('ADMIN', 'COADMIN'), validarBody(bodegaSchema), async (req, res, next) => {
  try {
    res.status(201).json(await db.bodega.create({ data: req.body }));
  } catch (e) { next(e); }
});

bodegasRouter.patch('/:id', requiereRol('ADMIN', 'COADMIN'), async (req, res, next) => {
  try {
    const { nombre, codigo, ciudad, direccion, regionId, activo } = req.body;
    const data: any = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (codigo !== undefined) data.codigo = codigo;
    if (ciudad !== undefined) data.ciudad = ciudad;
    if (direccion !== undefined) data.direccion = direccion;
    if (regionId !== undefined) data.regionId = regionId || null;
    if (activo !== undefined) data.activo = activo;
    res.json(await db.bodega.update({ where: { id: req.params.id }, data }));
  } catch (e) { next(e); }
});

bodegasRouter.delete('/:id', requiereRol('ADMIN', 'COADMIN'), async (req, res, next) => {
  try {
    await db.bodega.update({ where: { id: req.params.id }, data: { activo: false } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

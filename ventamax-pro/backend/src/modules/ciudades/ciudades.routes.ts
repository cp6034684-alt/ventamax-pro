import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';

export const ciudadesRouter = Router();
ciudadesRouter.use(requiereAuth);

// GET /api/ciudades — catalogo de ciudades con su region.
ciudadesRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT c.id, c.nombre, c.codigo, c."regionId", r.nombre AS "regionNombre"
      FROM ciudades c LEFT JOIN regiones r ON r.id = c."regionId"
      ORDER BY c.nombre`);
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/ciudades — crear ciudad (solo administradores).
ciudadesRouter.post('/', requiereRol('ADMIN', 'COADMIN'), async (req, res, next) => {
  try {
    const nombre = String(req.body?.nombre ?? '').trim();
    if (!nombre) return res.status(400).json({ error: 'El nombre de la ciudad es obligatorio' });
    const sin = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    let codigo = String(req.body?.codigo ?? '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (!codigo) codigo = sin.replace(/[^A-Z]/g, '').slice(0, 1);
    codigo = codigo.slice(0, 1);
    if (codigo.length < 1) return res.status(400).json({ error: 'El codigo del ticket necesita al menos 1 letra' });
    const regionId = req.body?.regionId ? String(req.body.regionId) : null;
    try {
      const rows = await db.$queryRaw<any[]>(Prisma.sql`
        INSERT INTO ciudades (nombre, codigo, "regionId") VALUES (${nombre}, ${codigo}, ${regionId})
        RETURNING id, nombre, codigo, "regionId"`);
      res.status(201).json(rows[0]);
    } catch (e: any) {
      if (String(e?.message || '').toLowerCase().includes('duplicate'))
        return res.status(400).json({ error: 'Ya existe una ciudad con ese nombre' });
      throw e;
    }
  } catch (e) { next(e); }
});

// DELETE /api/ciudades/:id (solo administradores).
ciudadesRouter.delete('/:id', requiereRol('ADMIN', 'COADMIN'), async (req, res, next) => {
  try {
    await db.$executeRaw(Prisma.sql`DELETE FROM ciudades WHERE id = ${req.params.id}`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

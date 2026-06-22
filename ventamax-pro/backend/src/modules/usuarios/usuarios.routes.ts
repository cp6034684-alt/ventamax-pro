import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';
import { validarBody } from '../../middleware/validate';

const LISTAS = ['GENERAL', 'MAYORISTA', 'TAT', 'DROGUERIAS'] as const;

const usuarioSchema = z.object({
  nombre: z.string().min(1),
  usuario: z.string().min(3),
  pin: z.string().regex(/^\d{4,6}$/),
  rol: z.enum(['ADMIN', 'COADMIN', 'SUPERVISOR', 'VENDEDOR', 'ENTREGADOR']),
  zona: z.string().optional(),
  documento: z.string().optional(),
  ciudad: z.string().optional(),
  telefono: z.string().optional(),
  meta: z.number().int().min(0).optional(),
  listasPrecios: z.array(z.enum(LISTAS)).optional(),
  regionId: z.string().uuid().nullable().optional(),
});

const ROLES_ELEVADOS = ['ADMIN', 'COADMIN'];

export const usuariosRouter = Router();
usuariosRouter.use(requiereAuth, requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'));

usuariosRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await db.usuario.findMany({
      select: ({ id: true, nombre: true, usuario: true, rol: true, zona: true, documento: true, ciudad: true, telefono: true, meta: true, listasPrecios: true, activo: true, creadoEn: true, regionId: true, region: { select: { id: true, nombre: true } } } as any),
      orderBy: { nombre: 'asc' },
    }));
  } catch (e) { next(e); }
});

usuariosRouter.post('/', validarBody(usuarioSchema), async (req, res, next) => {
  try {
    if (req.usuario!.rol === 'SUPERVISOR' && ROLES_ELEVADOS.includes(req.body.rol)) {
      return res.status(403).json({ error: 'Un supervisor no puede crear administradores' });
    }
    const { pin, ...resto } = req.body;
    const u = await db.usuario.create({
      data: ({ ...resto, pinHash: await bcrypt.hash(pin, 10) } as any),
      select: { id: true, nombre: true, usuario: true, rol: true },
    });
    res.status(201).json(u);
  } catch (e) { next(e); }
});

usuariosRouter.patch('/:id', async (req, res, next) => {
  try {
    const data: any = {};
    if (req.body.nombre) data.nombre = req.body.nombre;
    if (req.body.pin) data.pinHash = await bcrypt.hash(req.body.pin, 10);
    if (req.body.activo !== undefined) data.activo = req.body.activo;
    if (req.body.zona !== undefined) data.zona = req.body.zona;
    if (req.body.documento !== undefined) data.documento = req.body.documento;
    if (req.body.ciudad !== undefined) data.ciudad = req.body.ciudad;
    if (req.body.telefono !== undefined) data.telefono = req.body.telefono;
    if (req.body.meta !== undefined) data.meta = req.body.meta;
    if (req.body.rol) {
      if (req.usuario!.rol === 'SUPERVISOR' && ROLES_ELEVADOS.includes(req.body.rol)) {
        return res.status(403).json({ error: 'Un supervisor no puede asignar el rol de administrador' });
      }
      data.rol = req.body.rol;
    }
    if (req.body.listasPrecios) data.listasPrecios = req.body.listasPrecios;
    if (req.body.regionId !== undefined) data.regionId = req.body.regionId || null;
    res.json(await db.usuario.update({
      where: { id: req.params.id }, data,
      select: { id: true, nombre: true, rol: true, activo: true },
    }));
  } catch (e) { next(e); }
});

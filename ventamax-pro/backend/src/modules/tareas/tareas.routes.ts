import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';
import { validarBody } from '../../middleware/validate';

export const tareasRouter = Router();
tareasRouter.use(requiereAuth);

const programarSchema = z.object({
  nombre: z.string().min(1),
  entregadorId: z.string().uuid(),
  facturaIds: z.array(z.string().uuid()).min(1, 'Selecciona al menos un pedido'),
});

// GET /api/tareas?estado=&entregadorId= — tareas de entrega con sus pedidos
tareasRouter.get('/', async (req, res, next) => {
  try {
    const where: any = {};
    if (req.usuario!.rol === 'ENTREGADOR') where.entregadorId = req.usuario!.id;
    else if (req.query.entregadorId) where.entregadorId = String(req.query.entregadorId);
    if (req.query.estado) where.estado = String(req.query.estado);

    const tareas = await (db as any).tarea.findMany({
      where, orderBy: { creadoEn: 'desc' }, take: 200,
      include: {
        entregador: { select: { nombre: true } },
        facturas: {
          orderBy: { creadoEn: 'asc' },
          select: {
            id: true, consecutivo: true, estado: true, total: true, pagado: true,
            metodoPago: true, devuelta: true, montoDevuelto: true,
            cliente: { select: { nombre: true, barrio: true, direccion: true } },
          },
        },
      },
    });
    res.json(tareas);
  } catch (e) { next(e); }
});

// POST /api/tareas — programar entrega: asigna pedidos pendientes a un entregador
tareasRouter.post('/', requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'), validarBody(programarSchema), async (req, res, next) => {
  try {
    const tarea = await db.$transaction(async (tx: any) => {
      const t = await tx.tarea.create({ data: { nombre: req.body.nombre, entregadorId: req.body.entregadorId } });
      await tx.factura.updateMany({
        where: { id: { in: req.body.facturaIds }, estado: 'PENDIENTE' },
        data: { tareaId: t.id, entregadorId: req.body.entregadorId },
      });
      return t;
    });
    res.status(201).json(tarea);
  } catch (e) { next(e); }
});

// PATCH /api/tareas/:id — completar o renombrar la tarea
tareasRouter.patch('/:id', requiereRol('ENTREGADOR', 'ADMIN', 'COADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const data: any = {};
    if (req.body.estado) data.estado = req.body.estado;
    if (req.body.nombre) data.nombre = req.body.nombre;
    res.json(await (db as any).tarea.update({ where: { id: req.params.id }, data }));
  } catch (e) { next(e); }
});

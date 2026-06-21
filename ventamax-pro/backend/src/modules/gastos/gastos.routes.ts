import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/db';
import { requiereAuth } from '../../middleware/auth';
import { validarBody } from '../../middleware/validate';
import { leerPaginacion, respuestaPaginada } from '../../utils/pagination';

const gastoSchema = z.object({
  concepto: z.string().min(1),
  categoria: z.string().optional(),
  monto: z.number().positive(),
  notas: z.string().optional(),
});

export const gastosRouter = Router();
gastosRouter.use(requiereAuth);

gastosRouter.get('/', async (req, res, next) => {
  try {
    const { pagina, porPagina, skip, take } = leerPaginacion(req);
    const where: any = req.usuario!.rol === 'VENDEDOR' ? { usuarioId: req.usuario!.id } : {};
    const [datos, total] = await Promise.all([
      db.gasto.findMany({ where, skip, take, orderBy: { fecha: 'desc' }, include: { usuario: { select: { nombre: true } } } }),
      db.gasto.count({ where }),
    ]);
    res.json(respuestaPaginada(datos, total, pagina, porPagina));
  } catch (e) { next(e); }
});

gastosRouter.post('/', validarBody(gastoSchema), async (req, res, next) => {
  try {
    res.status(201).json(await db.gasto.create({ data: { ...req.body, usuarioId: req.usuario!.id } }));
  } catch (e) { next(e); }
});

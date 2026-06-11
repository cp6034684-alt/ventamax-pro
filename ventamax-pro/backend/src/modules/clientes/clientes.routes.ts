import { Router } from 'express';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';
import { validarBody } from '../../middleware/validate';
import { leerPaginacion, respuestaPaginada } from '../../utils/pagination';
import { clienteSchema, clienteUpdateSchema } from './clientes.schemas';

export const clientesRouter = Router();
clientesRouter.use(requiereAuth);

// GET /api/clientes?busqueda=&dia=&pagina=&porPagina=
clientesRouter.get('/', async (req, res, next) => {
  try {
    const { pagina, porPagina, skip, take } = leerPaginacion(req);
    const where: any = { activo: true };
    if (req.query.busqueda) {
      where.OR = [
        { nombre: { contains: String(req.query.busqueda), mode: 'insensitive' } },
        { barrio: { contains: String(req.query.busqueda), mode: 'insensitive' } },
      ];
    }
    if (req.query.dia) where.diaVisita = Number(req.query.dia);

    const [datos, total] = await Promise.all([
      db.cliente.findMany({ where, skip, take, orderBy: { nombre: 'asc' } }),
      db.cliente.count({ where }),
    ]);
    res.json(respuestaPaginada(datos, total, pagina, porPagina));
  } catch (e) { next(e); }
});

// GET /api/clientes/:id — incluye últimas 10 facturas
clientesRouter.get('/:id', async (req, res, next) => {
  try {
    const cliente = await db.cliente.findUnique({
      where: { id: req.params.id },
      include: { facturas: { take: 10, orderBy: { creadoEn: 'desc' } } },
    });
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(cliente);
  } catch (e) { next(e); }
});

clientesRouter.post('/', validarBody(clienteSchema), async (req, res, next) => {
  try {
    res.status(201).json(await db.cliente.create({ data: req.body }));
  } catch (e) { next(e); }
});

clientesRouter.put('/:id', validarBody(clienteUpdateSchema), async (req, res, next) => {
  try {
    res.json(await db.cliente.update({ where: { id: req.params.id }, data: req.body }));
  } catch (e) { next(e); }
});

// Borrado lógico — solo admins. Nunca borramos datos con historial de ventas.
clientesRouter.delete('/:id', requiereRol('ADMIN', 'COADMIN'), async (req, res, next) => {
  try {
    await db.cliente.update({ where: { id: req.params.id }, data: { activo: false } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

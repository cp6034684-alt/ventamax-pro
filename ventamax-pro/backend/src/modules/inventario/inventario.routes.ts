import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';
import { validarBody } from '../../middleware/validate';
import { leerPaginacion, respuestaPaginada } from '../../utils/pagination';

const movimientoSchema = z.object({
  productoId: z.string().uuid(),
  tipo: z.enum(['ENTRADA', 'AJUSTE', 'DEVOLUCION']),
  // ENTRADA/DEVOLUCION: cantidad positiva que se suma al stock.
  // AJUSTE: el stock queda EXACTAMENTE en `cantidad` (conteo físico).
  cantidad: z.number().int(),
  motivo: z.string().max(300).optional(),
});

export const inventarioRouter = Router();
inventarioRouter.use(requiereAuth);

// GET /api/inventario/bajo-stock — productos en o bajo el mínimo
inventarioRouter.get('/bajo-stock', async (_req, res, next) => {
  try {
    const productos = await db.$queryRaw(
      Prisma.sql`SELECT id, nombre, categoria, stock, "stockMinimo"
                 FROM productos
                 WHERE activo = true AND stock <= "stockMinimo"
                 ORDER BY (stock - "stockMinimo") ASC
                 LIMIT 200`,
    ) as any[];
    res.json(productos);
  } catch (e) { next(e); }
});

// GET /api/inventario/movimientos?productoId=&pagina=
inventarioRouter.get('/movimientos', async (req, res, next) => {
  try {
    const { pagina, porPagina, skip, take } = leerPaginacion(req);
    const where: any = {};
    if (req.query.productoId) where.productoId = String(req.query.productoId);
    const [datos, total] = await Promise.all([
      db.movimientoStock.findMany({
        where, skip, take,
        orderBy: { creadoEn: 'desc' },
        include: { producto: { select: { nombre: true } } },
      }),
      db.movimientoStock.count({ where }),
    ]);
    res.json(respuestaPaginada(datos, total, pagina, porPagina));
  } catch (e) { next(e); }
});

// POST /api/inventario/movimientos — entrada, ajuste o devolución (transaccional)
inventarioRouter.post('/movimientos', requiereRol('ADMIN', 'COADMIN'), validarBody(movimientoSchema), async (req, res, next) => {
  try {
    const { productoId, tipo, cantidad, motivo } = req.body;
    const resultado = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const producto = await tx.producto.findUnique({ where: { id: productoId } });
      if (!producto) throw Object.assign(new Error('Producto no existe'), { status: 404, expose: true });

      let delta: number;
      if (tipo === 'AJUSTE') {
        if (cantidad < 0) throw Object.assign(new Error('El conteo físico no puede ser negativo'), { status: 400, expose: true });
        delta = cantidad - producto.stock; // diferencia contra el conteo físico
      } else {
        if (cantidad <= 0) throw Object.assign(new Error('La cantidad debe ser positiva'), { status: 400, expose: true });
        delta = cantidad;
      }

      const actualizado = await tx.producto.update({
        where: { id: productoId },
        data: { stock: { increment: delta } },
      });
      const mov = await tx.movimientoStock.create({
        data: { productoId, tipo, cantidad: delta, motivo },
      });
      return { producto: actualizado, movimiento: mov };
    });
    res.status(201).json(resultado);
  } catch (e) { next(e); }
});

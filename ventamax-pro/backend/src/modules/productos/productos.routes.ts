import { Router } from 'express';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';
import { validarBody } from '../../middleware/validate';
import { leerPaginacion, respuestaPaginada } from '../../utils/pagination';
import { productoSchema, productoUpdateSchema } from './productos.schemas';

export const productosRouter = Router();
productosRouter.use(requiereAuth);

// GET /api/productos?busqueda=&categoria=&bajoStock=true
productosRouter.get('/', async (req, res, next) => {
  try {
    const { pagina, porPagina, skip, take } = leerPaginacion(req, 200);
    const where: any = { activo: true };
    if (req.query.busqueda) {
      where.OR = [
        { nombre: { contains: String(req.query.busqueda), mode: 'insensitive' } },
        { codigo: { contains: String(req.query.busqueda) } },
      ];
    }
    if (req.query.categoria) where.categoria = String(req.query.categoria);

    // Vendedor: sus datos para el filtro de focalizado y el stock por bodega.
    let vend: any = null;
    if (req.usuario?.rol === 'VENDEDOR') {
      vend = await db.usuario.findUnique({ where: { id: req.usuario.id }, select: ({ regionId: true, zona: true } as any) });
      // FOCALIZADO (ticket termina en -FOC): solo ve productos de la marca GENOMMA.
      if (String(vend?.zona ?? '').toUpperCase().includes('FOC')) {
        where.marca = { contains: 'GENOMMA', mode: 'insensitive' };
      }
    }

    const [datos, total] = await Promise.all([
      db.producto.findMany({ where, skip, take, orderBy: { nombre: 'asc' } }),
      db.producto.count({ where }),
    ]);
    // El precio de costo (precioCompra) solo lo pueden ver los administradores.
    // Para cualquier otro rol (supervisor, vendedor, entregador) se elimina antes de enviar.
    const veCosto = req.usuario && ['ADMIN', 'COADMIN'].includes(req.usuario.rol);
    let salida: any[] = veCosto
      ? datos
      : datos.map(({ precioCompra, ...resto }: any) => resto);

    // El VENDEDOR ve el stock de la bodega de SU región (no el total global de todas las bodegas).
    if (req.usuario?.rol === 'VENDEDOR') {
      let bodegaId: string | null = null;
      if (vend?.regionId) {
        const r = await (db as any).region.findUnique({ where: { id: vend.regionId }, select: { bodegaPrincipalId: true } });
        bodegaId = r?.bodegaPrincipalId ?? null;
      }
      if (bodegaId) {
        const ids = salida.map((x) => x.id);
        const sb = ids.length
          ? await (db as any).stockBodega.findMany({ where: { bodegaId, productoId: { in: ids } }, select: { productoId: true, cantidad: true } })
          : [];
        const m = new Map(sb.map((x: any) => [x.productoId, x.cantidad]));
        salida = salida.map((x) => ({ ...x, stock: m.get(x.id) ?? 0 }));
      }
      // Si el vendedor no tiene región/bodega asignada, se deja el stock global como respaldo.
    }

    res.json(respuestaPaginada(salida, total, pagina, porPagina));
  } catch (e) { next(e); }
});

productosRouter.post('/', requiereRol('ADMIN', 'COADMIN'), validarBody(productoSchema), async (req, res, next) => {
  try {
    res.status(201).json(await db.producto.create({ data: req.body }));
  } catch (e) { next(e); }
});

productosRouter.put('/:id', requiereRol('ADMIN', 'COADMIN'), validarBody(productoUpdateSchema), async (req, res, next) => {
  try {
    res.json(await db.producto.update({ where: { id: req.params.id }, data: req.body }));
  } catch (e) { next(e); }
});

productosRouter.delete('/:id', requiereRol('ADMIN'), async (req, res, next) => {
  try {
    await db.producto.update({ where: { id: req.params.id }, data: { activo: false } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

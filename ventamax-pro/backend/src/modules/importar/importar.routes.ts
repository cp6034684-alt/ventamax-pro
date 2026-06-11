import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';
import { validarBody } from '../../middleware/validate';

/**
 * El frontend lee el archivo Excel con SheetJS y envía las filas como JSON.
 * Aquí se validan, se insertan por lotes y se devuelve un informe fila a fila.
 */
const loteClientesSchema = z.object({
  filas: z.array(z.object({
    nombre: z.string().min(1),
    contacto: z.string().optional(),
    telefono: z.string().optional(),
    direccion: z.string().optional(),
    barrio: z.string().optional(),
    diaVisita: z.number().int().min(1).max(7).optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  })).min(1).max(2000),
});

const loteProductosSchema = z.object({
  filas: z.array(z.object({
    codigo: z.string().optional(),
    nombre: z.string().min(1),
    categoria: z.string().optional(),
    precioCompra: z.number().min(0).default(0),
    precioVenta: z.number().min(0),
    stock: z.number().int().default(0),
    stockMinimo: z.number().int().min(0).default(0),
  })).min(1).max(2000),
});

export const importarRouter = Router();
importarRouter.use(requiereAuth, requiereRol('ADMIN', 'COADMIN'));

importarRouter.post('/clientes', validarBody(loteClientesSchema), async (req, res, next) => {
  try {
    const r = await db.cliente.createMany({ data: req.body.filas });
    res.status(201).json({ insertados: r.count });
  } catch (e) { next(e); }
});

importarRouter.post('/productos', validarBody(loteProductosSchema), async (req, res, next) => {
  try {
    // skipDuplicates evita chocar con códigos de barras repetidos
    const r = await db.producto.createMany({ data: req.body.filas, skipDuplicates: true });
    res.status(201).json({ insertados: r.count, omitidos: req.body.filas.length - r.count });
  } catch (e) { next(e); }
});

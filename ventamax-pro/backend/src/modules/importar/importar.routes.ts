import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';
import { validarBody } from '../../middleware/validate';
import { maxCodigoCliente } from '../clientes/codigo';

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
    ciudad: z.string().optional(),
    correo: z.string().optional(),
    nit: z.string().optional(),
    zona: z.string().optional(),
    segmento: z.string().optional(),
    razonSocial: z.string().optional(),
    tipologia: z.string().optional(),
    listaPrecio: z.string().optional(),
    diaVisita: z.number().int().min(1).max(7).optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  })).min(1).max(2000),
  // true → el sistema asigna código VMX correlativo (rutero familia)
  // false/ausente → se deja el código vacío (surtimax, se asigna luego)
  asignarCodigo: z.boolean().optional(),
});

const loteProductosSchema = z.object({
  filas: z.array(z.object({
    codigo: z.string().optional(),
    nombre: z.string().min(1),
    categoria: z.string().optional(),
    marca: z.string().optional(),
    linea: z.string().optional(),
    segmento: z.string().optional(),
    subsegmento: z.string().optional(),
    unidad: z.string().optional(),
    iva: z.number().min(0).optional(),
    precioCompra: z.number().min(0).default(0),
    precioVenta: z.number().min(0).optional(),
    precioGeneral: z.number().min(0).optional(),
    precioMayorista: z.number().min(0).optional(),
    precioTat: z.number().min(0).optional(),
    precioDroguerias: z.number().min(0).optional(),
    precioTatViajeros: z.number().min(0).optional(),
    precioEntreSede: z.number().min(0).optional(),
    stock: z.number().int().default(0),
    stockMinimo: z.number().int().min(0).default(0),
  })).min(1).max(2000),
});

export const importarRouter = Router();
importarRouter.use(requiereAuth, requiereRol('ADMIN', 'COADMIN'));

importarRouter.post('/clientes', validarBody(loteClientesSchema), async (req, res, next) => {
  try {
    let data = req.body.filas;
    if (req.body.asignarCodigo) {
      // Asigna códigos VMX correlativos a partir del último existente
      const base = await maxCodigoCliente();
      data = data.map((f: any, i: number) => ({ ...f, codigo: base + i + 1 }));
    }
    const r = await db.cliente.createMany({ data });
    res.status(201).json({ insertados: r.count });
  } catch (e) { next(e); }
});

// Asignar lista de precio (y opcionalmente tipología) a clientes EXISTENTES por NIT.
// No crea clientes: actualiza los que ya están en la base.
const loteListasSchema = z.object({
  filas: z.array(z.object({
    nit: z.string().min(1),
    listaPrecio: z.string().min(1),
    tipologia: z.string().optional(),
  })).min(1).max(10000),
});

const LISTAS_VALIDAS = new Set(['GENERAL', 'MAYORISTA', 'TAT', 'DROGUERIAS', 'TAT_VIAJEROS', 'ENTRE_SEDE']);
const normLista = (l: string) => l.trim().toUpperCase().replace(/\s+/g, '_');

importarRouter.post('/listas-cliente', validarBody(loteListasSchema), async (req, res, next) => {
  try {
    // Agrupar NITs por lista para actualizar en pocas consultas.
    const porLista = new Map<string, Set<string>>();
    const tipologiaPorNit = new Map<string, string>();
    let invalidas = 0;

    for (const f of req.body.filas as any[]) {
      const lista = normLista(String(f.listaPrecio || ''));
      if (!LISTAS_VALIDAS.has(lista)) { invalidas++; continue; }
      if (!porLista.has(lista)) porLista.set(lista, new Set());
      porLista.get(lista)!.add(String(f.nit).trim());
      if (f.tipologia) tipologiaPorNit.set(String(f.nit).trim(), String(f.tipologia));
    }

    let actualizados = 0;
    for (const [lista, nits] of porLista) {
      const r = await db.cliente.updateMany({ where: { nit: { in: [...nits] } }, data: { listaPrecio: lista } });
      actualizados += r.count;
    }
    // Tipología (si vino en el archivo)
    for (const [nit, tipologia] of tipologiaPorNit) {
      await db.cliente.updateMany({ where: { nit }, data: { tipologia } });
    }

    res.json({ actualizados, listas: porLista.size, invalidas });
  } catch (e) { next(e); }
});

importarRouter.post('/productos', validarBody(loteProductosSchema), async (req, res, next) => {
  try {
    // precioVenta por defecto = lista TAT (o 0); las listas guían el precio real
    const data = req.body.filas.map((f: any) => ({
      ...f, precioVenta: f.precioVenta ?? f.precioTat ?? 0,
    }));
    // skipDuplicates evita chocar con códigos de barras repetidos
    const r = await db.producto.createMany({ data, skipDuplicates: true });
    res.status(201).json({ insertados: r.count, omitidos: data.length - r.count });
  } catch (e) { next(e); }
});

// ── Inventario (informe de bodega) ────────────────────────────
// Actualiza por REFERENCIA(codigo): existencia (stock) y precio TAT,
// corrige la marca; crea los productos que no existan.
const loteInventarioSchema = z.object({
  filas: z.array(z.object({
    codigo: z.string().min(1),
    nombre: z.string().optional(),
    marca: z.string().optional(),
    precioTat: z.number().min(0).optional(),
    stock: z.number().optional(),
  })).min(1).max(2000),
});

importarRouter.post('/inventario', validarBody(loteInventarioSchema), async (req, res, next) => {
  try {
    const filas = (req.body.filas as any[]).map((f) => ({
      codigo: String(f.codigo).trim(),
      nombre: f.nombre ? String(f.nombre).trim() : undefined,
      marca: f.marca ? String(f.marca).trim() : undefined,
      precioTat: typeof f.precioTat === 'number' ? f.precioTat : undefined,
      stock: typeof f.stock === 'number' ? Math.round(f.stock) : 0,
    })).filter((f) => f.codigo);

    const codigos = filas.map((f) => f.codigo);
    const existentes = await db.producto.findMany({ where: { codigo: { in: codigos } }, select: { id: true, codigo: true } });
    const mapa = new Map(existentes.map((p) => [p.codigo as string, p.id]));

    const ops: any[] = [];
    const nuevos: any[] = [];
    for (const f of filas) {
      const id = mapa.get(f.codigo);
      if (id) {
        const data: any = { stock: f.stock };
        if (f.precioTat !== undefined) { data.precioTat = f.precioTat; data.precioVenta = f.precioTat; }
        if (f.marca) data.marca = f.marca;
        if (f.nombre) data.nombre = f.nombre;
        ops.push(db.producto.update({ where: { id }, data }));
      } else {
        nuevos.push({
          codigo: f.codigo, nombre: f.nombre || f.codigo, marca: f.marca,
          precioTat: f.precioTat ?? 0, precioVenta: f.precioTat ?? 0, stock: f.stock,
        });
      }
    }
    if (nuevos.length) ops.push(db.producto.createMany({ data: nuevos, skipDuplicates: true }));
    await db.$transaction(ops);
    res.json({ actualizados: filas.length - nuevos.length, creados: nuevos.length });
  } catch (e) { next(e); }
});

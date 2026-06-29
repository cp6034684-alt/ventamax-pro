import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';
import { validarBody } from '../../middleware/validate';
import { maxCodigoCliente } from '../clientes/codigo';
import { env } from '../../config/env';
import { registrarActividad } from '../../utils/actividad';

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
    registrarActividad(req.usuario!.id, 'IMPORTACION', `Clientes: ${r.count}`);
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
    registrarActividad(req.usuario!.id, 'IMPORTACION', `Productos: ${r.count}`);
    res.status(201).json({ insertados: r.count, omitidos: data.length - r.count });
  } catch (e) { next(e); }
});

// ── Actualizar PRECIOS + IVA de productos EXISTENTES por código ──
// No toca el stock. Reemplaza las listas de precio y el % de IVA por referencia.
const lotePreciosSchema = z.object({
  filas: z.array(z.object({
    codigo: z.string().min(1),
    precioGeneral: z.number().min(0).optional(),
    precioMayorista: z.number().min(0).optional(),
    precioTat: z.number().min(0).optional(),
    precioDroguerias: z.number().min(0).optional(),
    precioVenta: z.number().min(0).optional(),
    iva: z.number().min(0).optional(),
  })).min(1).max(5000),
});

importarRouter.post('/precios', validarBody(lotePreciosSchema), async (req, res, next) => {
  try {
    const porCodigo = new Map<string, any>();
    for (const raw of req.body.filas as any[]) {
      const codigo = String(raw.codigo).trim();
      if (!codigo) continue;
      const n = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      porCodigo.set(codigo, {
        codigo,
        gen: n(raw.precioGeneral), may: n(raw.precioMayorista),
        tat: n(raw.precioTat), drog: n(raw.precioDroguerias),
        venta: n(raw.precioVenta) ?? n(raw.precioTat),
        iva: n(raw.iva),
      });
    }
    const filas = [...porCodigo.values()];
    if (!filas.length) return res.json({ actualizados: 0, recibidos: 0 });

    const codigos = filas.map((f) => f.codigo);
    const gen = filas.map((f) => f.gen);
    const may = filas.map((f) => f.may);
    const tat = filas.map((f) => f.tat);
    const drog = filas.map((f) => f.drog);
    const venta = filas.map((f) => f.venta);
    const ivas = filas.map((f) => f.iva);

    const r = await db.$executeRaw(Prisma.sql`
      UPDATE productos AS p SET
        "precioGeneral"    = COALESCE(d.gen,   p."precioGeneral"),
        "precioMayorista"  = COALESCE(d.may,   p."precioMayorista"),
        "precioTat"        = COALESCE(d.tat,   p."precioTat"),
        "precioDroguerias" = COALESCE(d.drog,  p."precioDroguerias"),
        "precioVenta"      = COALESCE(d.venta, p."precioVenta"),
        iva                = COALESCE(d.iva,   p.iva)
      FROM unnest(${codigos}::text[], ${gen}::numeric[], ${may}::numeric[], ${tat}::numeric[], ${drog}::numeric[], ${venta}::numeric[], ${ivas}::numeric[])
        AS d(codigo, gen, may, tat, drog, venta, iva)
      WHERE p.codigo = d.codigo`);

    res.json({ actualizados: r, recibidos: filas.length });
  } catch (e) { next(e); }
});

// ── Carga masiva de VENDEDORES ────────────────────────────────
// Crea usuarios rol VENDEDOR. usuario = documento, PIN = últimos 4 del documento.
// Resuelve/crea la región por nombre. No recrea usuarios ya existentes.
const loteVendedoresSchema = z.object({
  filas: z.array(z.object({
    documento: z.string().min(3),
    nombre: z.string().min(1),
    ciudad: z.string().optional(),
    region: z.string().optional(),
    zona: z.string().optional(),
    meta: z.number().optional(),
    listasPrecios: z.string().optional(),
  })).min(1).max(500),
});

const LISTAS_VEND = new Set(['GENERAL', 'MAYORISTA', 'TAT', 'DROGUERIAS', 'TAT_VIAJEROS', 'ENTRE_SEDE']);

importarRouter.post('/vendedores', validarBody(loteVendedoresSchema), async (req, res, next) => {
  try {
    // Resolver/crear regiones por nombre
    const regionId = new Map<string, string>();
    const nombres = [...new Set((req.body.filas as any[])
      .map((f) => String(f.region || '').trim().toUpperCase()).filter(Boolean))];
    for (const nom of nombres) {
      let r = await (db as any).region.findUnique({ where: { nombre: nom } });
      if (!r) r = await (db as any).region.create({ data: { nombre: nom } });
      regionId.set(nom, r.id);
    }

    let creados = 0, omitidos = 0;
    const detalle: any[] = [];
    for (const f of req.body.filas as any[]) {
      const usuario = String(f.documento).trim();
      const ya = await db.usuario.findUnique({ where: { usuario } });
      if (ya) { omitidos++; detalle.push({ usuario, estado: 'ya existe' }); continue; }
      const pin = usuario.slice(-4).padStart(4, '0');
      const listas = String(f.listasPrecios || '').split(',')
        .map((x) => x.trim().toUpperCase()).filter((x) => LISTAS_VEND.has(x));
      const reg = f.region ? regionId.get(String(f.region).trim().toUpperCase()) ?? null : null;
      await db.usuario.create({
        data: ({
          nombre: String(f.nombre).trim(),
          usuario,
          pinHash: await bcrypt.hash(pin, 10),
          rol: 'VENDEDOR',
          documento: usuario,
          ciudad: f.ciudad ? String(f.ciudad).trim() : null,
          zona: f.zona ? String(f.zona).trim() : null,
          meta: typeof f.meta === 'number' ? Math.round(f.meta) : undefined,
          listasPrecios: listas,
          regionId: reg,
        } as any),
      });
      creados++;
      detalle.push({ usuario, estado: 'creado', pin });
    }
    res.json({ creados, omitidos, detalle });
  } catch (e) { next(e); }
});

// ── Inventario por bodega (informe de bodega) ─────────────────
// Actualiza la EXISTENCIA por bodega + precio/marca por REFERENCIA(codigo),
// registra la carga (para poder devolverla) y recalcula el total del producto.
const loteInventarioSchema = z.object({
  bodegaId: z.string().uuid(),
  archivo: z.string().optional(),
  filas: z.array(z.object({
    codigo: z.string().min(1),
    nombre: z.string().optional(),
    marca: z.string().optional(),
    precioTat: z.number().min(0).optional(),
    stock: z.number().optional(),
  })).min(1).max(5000),
});

async function procesarInventario(
  bodegaId: string, filasRaw: any[], archivo: string | null, usuarioId: string | null,
) {
    const porCodigo = new Map<string, any>();
    for (const raw of filasRaw) {
      const codigo = String(raw.codigo).trim();
      if (!codigo) continue;
      porCodigo.set(codigo, {
        codigo,
        nombre: raw.nombre ? String(raw.nombre).trim() : null,
        marca: raw.marca ? String(raw.marca).trim() : null,
        precioTat: typeof raw.precioTat === 'number' ? raw.precioTat : null,
        cantidad: typeof raw.stock === 'number' ? Math.round(raw.stock) : 0,
      });
    }
    const filas = [...porCodigo.values()];
    if (!filas.length) return { actualizados: 0, creados: 0, cargaId: null };

    return await db.$transaction(async (tx) => {
      const bodega = await (tx as any).bodega.findUnique({ where: { id: bodegaId } });
      if (!bodega) throw Object.assign(new Error('Bodega no encontrada'), { status: 400, expose: true });

      const codigos = filas.map((f) => f.codigo);
      const existentes = await tx.producto.findMany({ where: { codigo: { in: codigos } }, select: { id: true, codigo: true } });
      const mapa = new Map(existentes.map((p) => [p.codigo as string, p.id]));

      const nuevos = filas.filter((f) => !mapa.has(f.codigo));
      if (nuevos.length) {
        await tx.producto.createMany({
          // Producto nuevo: queda VENDIBLE en todas las listas (todas = TAT por defecto)
          // e IVA 19% por defecto. El archivo maestro de precios afina luego listas/IVA exactos.
          data: nuevos.map((f) => {
            const p = f.precioTat ?? 0;
            return ({
              codigo: f.codigo, nombre: f.nombre || f.codigo, marca: f.marca ?? undefined,
              precioTat: p, precioVenta: p, precioGeneral: p, precioMayorista: p,
              precioDroguerias: p, precioTatViajeros: p, precioEntreSede: p,
              iva: 19, stock: 0,
            } as any);
          }),
          skipDuplicates: true,
        });
        const recien = await tx.producto.findMany({ where: { codigo: { in: nuevos.map((n) => n.codigo) } }, select: { id: true, codigo: true } });
        for (const p of recien) mapa.set(p.codigo as string, p.id);
      }

      const conId = filas.map((f) => ({ ...f, productoId: mapa.get(f.codigo)! })).filter((f) => f.productoId);
      const prodIds = conId.map((f) => f.productoId);

      const sbPrev = await (tx as any).stockBodega.findMany({ where: { bodegaId, productoId: { in: prodIds } }, select: { productoId: true, cantidad: true } });
      const prevMap = new Map(sbPrev.map((s: any) => [s.productoId, s.cantidad]));

      const carga = await (tx as any).cargaInventario.create({
        data: { bodegaId, usuarioId, archivo, totalItems: conId.length },
      });
      await (tx as any).cargaInventarioItem.createMany({
        data: conId.map((f) => ({ cargaId: carga.id, productoId: f.productoId, cantidadAnterior: prevMap.get(f.productoId) ?? 0, cantidadNueva: f.cantidad })),
      });

      await (tx as any).stockBodega.deleteMany({ where: { bodegaId, productoId: { in: prodIds } } });
      await (tx as any).stockBodega.createMany({
        data: conId.map((f) => ({ productoId: f.productoId, bodegaId, cantidad: f.cantidad })),
      });

      const ids = conId.map((f) => f.productoId);
      const precios = conId.map((f) => f.precioTat);
      const marcas = conId.map((f) => f.marca);
      const nombres = conId.map((f) => f.nombre);
      await tx.$executeRaw(Prisma.sql`
        UPDATE productos AS p SET
          "precioTat"   = COALESCE(d.precio, p."precioTat"),
          "precioVenta" = COALESCE(d.precio, p."precioVenta"),
          marca         = COALESCE(d.marca, p.marca),
          nombre        = COALESCE(d.nombre, p.nombre)
        FROM unnest(${ids}::text[], ${precios}::numeric[], ${marcas}::text[], ${nombres}::text[]) AS d(id, precio, marca, nombre)
        WHERE p.id = d.id`);

      await tx.$executeRaw(Prisma.sql`
        UPDATE productos p SET stock = COALESCE((SELECT SUM(sb.cantidad)::int FROM stock_bodega sb WHERE sb."productoId" = p.id), 0)
        WHERE p.id IN (SELECT "productoId" FROM stock_bodega WHERE "bodegaId" = ${bodegaId})`);

      return { actualizados: conId.length - nuevos.length, creados: nuevos.length, cargaId: carga.id };
  }, { timeout: 120000, maxWait: 20000 });
}

importarRouter.post('/inventario', validarBody(loteInventarioSchema), async (req, res, next) => {
  try {
    res.json(await procesarInventario(req.body.bodegaId, req.body.filas, req.body.archivo ?? null, req.usuario!.id));
  } catch (e) { next(e); }
});

// ── Auto-import seguro (token) para actualizar inventario automáticamente ──
// Lo usa la tarea programada (3x/día). No requiere login de usuario, solo el token.
const importToken = (req: any, res: any, next: any) => {
  const tok = String(req.headers['x-import-token'] ?? '').trim();
  const real = String(env.IMPORT_TOKEN ?? '').trim();
  if (!real || tok !== real) {
    return res.status(401).json({ error: 'Token invalido', serverHasToken: !!real, recvLen: tok.length, serverLen: real.length });
  }
  next();
};
const loteInventarioAutoSchema = z.object({
  region: z.string().optional(),
  bodegaId: z.string().uuid().optional(),
  archivo: z.string().optional(),
  filas: z.array(z.object({
    codigo: z.string().min(1),
    nombre: z.string().optional(),
    marca: z.string().optional(),
    precioTat: z.number().min(0).optional(),
    stock: z.number().optional(),
  })).min(1).max(5000),
});
export const importarAutoRouter = Router();
importarAutoRouter.post('/inventario-auto', importToken, validarBody(loteInventarioAutoSchema), async (req, res, next) => {
  try {
    let bodegaId = req.body.bodegaId as string | undefined;
    if (!bodegaId && req.body.region) {
      const r = await (db as any).region.findUnique({ where: { nombre: String(req.body.region).trim().toUpperCase() } });
      if (!r?.bodegaPrincipalId) return res.status(400).json({ error: 'La region no tiene bodega principal asignada' });
      bodegaId = r.bodegaPrincipalId as string;
    }
    if (!bodegaId) return res.status(400).json({ error: 'Falta bodegaId o region' });
    res.json(await procesarInventario(bodegaId, req.body.filas, req.body.archivo ?? 'auto', null));
  } catch (e) { next(e); }
});

// Cargas recientes (para devolver la última si fue a la bodega equivocada)
importarRouter.get('/inventario/cargas', async (req, res, next) => {
  try {
    const where: any = {};
    if (req.query.bodegaId) where.bodegaId = String(req.query.bodegaId);
    const cargas = await (db as any).cargaInventario.findMany({
      where, orderBy: { creadoEn: 'desc' }, take: 30,
      include: { bodega: { select: { nombre: true } } },
    });
    res.json(cargas);
  } catch (e) { next(e); }
});

// Devolver (revertir) una carga: restaura el saldo anterior de cada producto en esa bodega
importarRouter.post('/inventario/cargas/:id/revertir', async (req, res, next) => {
  try {
    const out = await db.$transaction(async (tx) => {
      const carga = await (tx as any).cargaInventario.findUnique({ where: { id: req.params.id }, include: { items: true } });
      if (!carga) throw Object.assign(new Error('Carga no encontrada'), { status: 404, expose: true });
      if (carga.revertida) throw Object.assign(new Error('Esta carga ya fue devuelta'), { status: 400, expose: true });
      for (const it of carga.items as any[]) {
        await (tx as any).stockBodega.updateMany({
          where: { bodegaId: carga.bodegaId, productoId: it.productoId },
          data: { cantidad: it.cantidadAnterior },
        });
      }
      await tx.$executeRaw(Prisma.sql`
        UPDATE productos p SET stock = COALESCE((SELECT SUM(sb.cantidad)::int FROM stock_bodega sb WHERE sb."productoId" = p.id), 0)
        WHERE p.id IN (SELECT "productoId" FROM stock_bodega WHERE "bodegaId" = ${carga.bodegaId})`);
      await (tx as any).cargaInventario.update({ where: { id: carga.id }, data: { revertida: true } });
      return { revertida: true, items: (carga.items as any[]).length };
    }, { timeout: 120000, maxWait: 20000 });
    res.json(out);
  } catch (e) { next(e); }
});

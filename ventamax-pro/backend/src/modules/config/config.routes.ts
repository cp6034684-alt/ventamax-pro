import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { db } from '../../config/db';
import { requiereAuth, requiereRol } from '../../middleware/auth';

export const configRouter = Router();
configRouter.use(requiereAuth);

// Columna de precio por canal.
const COL: Record<string, string> = {
  GENERAL: 'precioGeneral', MAYORISTA: 'precioMayorista', TAT: 'precioTat',
  DROGUERIAS: 'precioDroguerias', TAT_VIAJEROS: 'precioTatViajeros', ENTRE_SEDE: 'precioEntreSede',
};
const CANALES = Object.keys(COL);

// GET /api/config/factores — factores por canal (relativos al General)
configRouter.get('/factores', async (_req, res, next) => {
  try {
    const rows = await db.$queryRaw<any[]>(Prisma.sql`SELECT canal, factor FROM factores_canal`);
    const map: Record<string, number> = {};
    for (const r of rows) map[r.canal] = Number(r.factor);
    res.json(CANALES.map(c => ({ canal: c, factor: map[c] ?? 1 })));
  } catch (e) { next(e); }
});

// PUT /api/config/factores — guardar factores (solo administradores)
configRouter.put('/factores', requiereRol('ADMIN', 'COADMIN'), async (req, res, next) => {
  try {
    const items: { canal: string; factor: number }[] = req.body?.factores ?? [];
    for (const it of items) {
      if (!CANALES.includes(it.canal)) continue;
      const f = Number(it.factor);
      if (!Number.isFinite(f) || f <= 0) continue;
      await db.$executeRaw(Prisma.sql`
        INSERT INTO factores_canal (canal, factor) VALUES (${it.canal}, ${f})
        ON CONFLICT (canal) DO UPDATE SET factor = ${f}`);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/config/factores/recuperar — calcula los factores reales desde el catalogo
// (mediana de precioCanal / precioGeneral) y los guarda. El GENERAL siempre = 1.
configRouter.post('/factores/recuperar', requiereRol('ADMIN', 'COADMIN'), async (_req, res, next) => {
  try {
    const r = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "precioMayorista"  / "precioGeneral") FILTER (WHERE "precioMayorista"  > 0) AS mayorista,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "precioTat"        / "precioGeneral") FILTER (WHERE "precioTat"        > 0) AS tat,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "precioDroguerias" / "precioGeneral") FILTER (WHERE "precioDroguerias" > 0) AS droguerias,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "precioTatViajeros"/ "precioGeneral") FILTER (WHERE "precioTatViajeros">0) AS viajeros,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "precioEntreSede"  / "precioGeneral") FILTER (WHERE "precioEntreSede"  > 0) AS entresede
      FROM productos WHERE "precioGeneral" > 0`);
    const f = r[0] ?? {};
    const norm = (v: any) => { const n = Number(v); return Number.isFinite(n) && n > 0.05 && n < 20 ? Math.round(n * 1000) / 1000 : 1; };
    const valores: Record<string, number> = {
      GENERAL: 1, MAYORISTA: norm(f.mayorista), TAT: norm(f.tat),
      DROGUERIAS: norm(f.droguerias), TAT_VIAJEROS: norm(f.viajeros), ENTRE_SEDE: norm(f.entresede),
    };
    for (const c of CANALES) {
      await db.$executeRaw(Prisma.sql`
        INSERT INTO factores_canal (canal, factor) VALUES (${c}, ${valores[c]})
        ON CONFLICT (canal) DO UPDATE SET factor = ${valores[c]}`);
    }
    res.json(CANALES.map(c => ({ canal: c, factor: valores[c] })));
  } catch (e) { next(e); }
});

// -- Correos autorizados para inventario por correo --------------------------
// Los administradores definen desde la app QUE remitentes pueden enviar el
// Excel de inventario. El script de correo (tarea 3x/dia) lee esta lista.
configRouter.get('/correos-inventario', requiereRol('ADMIN', 'COADMIN'), async (_req, res, next) => {
  try {
    const rows = await db.$queryRaw<any[]>(Prisma.sql`SELECT email FROM correos_inventario ORDER BY email`);
    res.json(rows.map(r => r.email));
  } catch (e) { next(e); }
});

configRouter.put('/correos-inventario', requiereRol('ADMIN', 'COADMIN'), async (req, res, next) => {
  try {
    const lista: string[] = Array.isArray(req.body?.correos) ? req.body.correos : [];
    const limpios = [...new Set(lista
      .map(c => String(c || '').trim().toLowerCase())
      .filter(c => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)))];
    await db.$executeRaw(Prisma.sql`DELETE FROM correos_inventario`);
    for (const email of limpios) {
      await db.$executeRaw(Prisma.sql`INSERT INTO correos_inventario (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`);
    }
    res.json(limpios);
  } catch (e) { next(e); }
});

// Helper reutilizable: factores por canal en un objeto.
export async function factoresCanal(): Promise<Record<string, number>> {
  try {
    const rows = await db.$queryRaw<any[]>(Prisma.sql`SELECT canal, factor FROM factores_canal`);
    const map: Record<string, number> = {};
    for (const r of rows) map[r.canal] = Number(r.factor);
    return map;
  } catch { return {}; }
}

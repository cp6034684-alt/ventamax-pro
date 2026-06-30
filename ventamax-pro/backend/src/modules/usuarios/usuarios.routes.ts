import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
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
  canal: z.string().optional(), // MIXTO|FOCALIZADO|MAYORISTA|VIAJERO (genera el ticket)
  meta: z.number().int().min(0).optional(),
  listasPrecios: z.array(z.enum(LISTAS)).optional(),
  regionId: z.string().uuid().nullable().optional(),
  supervisorId: z.string().uuid().nullable().optional(),
});

const ROLES_ELEVADOS = ['ADMIN', 'COADMIN'];

// ── Ticket/zona del vendedor: CIUDAD-NN-CANAL (ej. ARM-07-MIX) ──
const CIU_COD: Record<string, string> = { ARMENIA: 'A', IBAGUE: 'I', PEREIRA: 'P' };
const REG_CIU: Record<string, string> = { ARMENIA: 'QUINDIO', PEREIRA: 'QUINDIO', IBAGUE: 'TOLIMA' };
const sinTilde = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function ciudadCod(c?: string) { const u = sinTilde(String(c ?? '').trim().toUpperCase()); return (CIU_COD[u] ?? u.slice(0, 1)).slice(0, 1); }
function canalCod(c?: string) {
  const u = String(c ?? '').trim().toUpperCase();
  if (u.startsWith('MIX')) return 'M';
  if (u.startsWith('FOC')) return 'F';
  if (u.startsWith('MAY')) return 'Y';
  if (u.startsWith('VIA')) return 'V';
  if (u.startsWith('SUP')) return 'S';
  return 'G';
}
// Busca el codigo de ticket y la region de una ciudad en el catalogo (tabla ciudades);
// si no esta, usa los valores fijos historicos (ARMENIA/IBAGUE/PEREIRA).
async function infoCiudad(nombre?: string): Promise<{ codigo: string; regionId: string | null }> {
  const u = sinTilde(String(nombre ?? '').trim().toUpperCase());
  if (!u) return { codigo: '', regionId: null };
  try {
    const rows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT codigo, "regionId" FROM ciudades WHERE upper(unaccent(nombre)) = ${u} LIMIT 1`);
    if (rows[0]) return { codigo: String(rows[0].codigo || u.slice(0, 1)).toUpperCase().slice(0, 1), regionId: rows[0].regionId ?? null };
  } catch { /* sin catalogo: cae al fallback */ }
  let regionId: string | null = null;
  const regName = REG_CIU[u];
  if (regName) {
    try {
      let r = await (db as any).region.findUnique({ where: { nombre: regName } });
      if (!r) r = await (db as any).region.create({ data: { nombre: regName } });
      regionId = r.id;
    } catch { /* ignora */ }
  }
  return { codigo: (CIU_COD[u] ?? u.slice(0, 1)).slice(0, 1), regionId };
}

// Numero consecutivo de un ticket si pertenece a la ciudad `ciu` (1 letra). Acepta el
// formato compacto nuevo (AM7) y el viejo (ARM-07-MIX), para no repetir numeros.
function numeroDeTicket(zona: string, ciu: string): number {
  const z = String(zona ?? '').toUpperCase();
  let m = new RegExp('^' + ciu + '[MFYVSG](\\d+)$').exec(z);
  if (m) return parseInt(m[1], 10) || 0;
  m = /^([A-Z]{3})-(\d+)-[A-Z]{3}$/.exec(z);
  if (m && m[1][0] === ciu) return parseInt(m[2], 10) || 0;
  return 0;
}
async function siguienteTicket(ciudad?: string, canal?: string) {
  const info = await infoCiudad(ciudad);
  const ciu = ((info.codigo || sinTilde(String(ciudad ?? '')).toUpperCase().slice(0, 1)) || 'X').slice(0, 1);
  const vendedores = await db.usuario.findMany({ where: { zona: { not: null } }, select: { zona: true } });
  let max = 0;
  for (const v of vendedores) { const n = numeroDeTicket(String(v.zona ?? ''), ciu); if (n > max) max = n; }
  return `${ciu}${canalCod(canal)}${max + 1}`;
}

export const usuariosRouter = Router();
usuariosRouter.use(requiereAuth, requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'));

// Previsualizar el ticket que se asignaría a un nuevo vendedor de esa ciudad/canal.
usuariosRouter.get('/siguiente-ticket', async (req, res, next) => {
  try {
    res.json({ ticket: await siguienteTicket(String(req.query.ciudad || ''), String(req.query.canal || '')) });
  } catch (e) { next(e); }
});

// PATCH /api/usuarios/:id/reemplazar — la misma ruta/ticket, persona nueva.
// Cambia nombre, documento y teléfono, y SINCRONIZA el acceso: usuario = documento
// y PIN = últimos 4 del documento. Conserva ticket, región, canal, listas y rol.
usuariosRouter.patch('/:id/reemplazar', async (req, res, next) => {
  try {
    const nombre = String(req.body?.nombre ?? '').trim();
    const doc = String(req.body?.documento ?? '').replace(/\D/g, '');
    if (!nombre || !doc) return res.status(400).json({ error: 'Nombre y documento son obligatorios' });
    const pin = doc.slice(-4).padStart(4, '0');
    try {
      const u = await db.usuario.update({
        where: { id: req.params.id },
        data: ({
          nombre, documento: doc, usuario: doc,
          telefono: req.body?.telefono ? String(req.body.telefono) : null,
          pinHash: await bcrypt.hash(pin, 10),
        } as any),
        select: { id: true, nombre: true, usuario: true, zona: true } as any,
      });
      res.json({ ...u, pin });
    } catch (e: any) {
      if (e?.code === 'P2002') return res.status(400).json({ error: 'Ya existe otro usuario con ese documento (login). Desactívalo o usa otro documento.' });
      throw e;
    }
  } catch (e) { next(e); }
});

usuariosRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await db.usuario.findMany({
      select: ({ id: true, nombre: true, usuario: true, rol: true, zona: true, documento: true, ciudad: true, telefono: true, meta: true, listasPrecios: true, activo: true, creadoEn: true, regionId: true, region: { select: { id: true, nombre: true } }, supervisorId: true, supervisor: { select: { id: true, nombre: true } } } as any),
      orderBy: { nombre: 'asc' },
    }));
  } catch (e) { next(e); }
});

usuariosRouter.post('/', validarBody(usuarioSchema), async (req, res, next) => {
  try {
    if (req.usuario!.rol === 'SUPERVISOR' && ROLES_ELEVADOS.includes(req.body.rol)) {
      return res.status(403).json({ error: 'Un supervisor no puede crear administradores' });
    }
    const { pin, canal, ...resto } = req.body as any;
    if (resto.usuario) resto.usuario = String(resto.usuario).toLowerCase().replace(/[@\s]/g, '');
    // Vendedor o supervisor con ciudad: el sistema asigna el ticket (consecutivo de la ciudad),
    // la región según la ciudad y las listas de precio según el canal.
    // El supervisor usa el canal SUPERVISOR (ticket CIU-NN-SUP).
    const esCampo = resto.rol === 'VENDEDOR' || resto.rol === 'SUPERVISOR';
    const canalEf = canal || (resto.rol === 'SUPERVISOR' ? 'SUPERVISOR' : '');
    if (esCampo && (canalEf || resto.ciudad)) {
      if (!resto.zona && resto.ciudad) resto.zona = await siguienteTicket(resto.ciudad, canalEf);
      if (!resto.regionId && resto.ciudad) {
        const info = await infoCiudad(resto.ciudad);
        if (info.regionId) resto.regionId = info.regionId;
      }
      if (!resto.listasPrecios) {
        resto.listasPrecios = canalCod(canalEf) === 'F' ? ['DROGUERIAS'] : ['GENERAL', 'MAYORISTA', 'TAT', 'DROGUERIAS'];
      }
    }
    const u = await db.usuario.create({
      data: ({ ...resto, pinHash: await bcrypt.hash(pin, 10) } as any),
      select: { id: true, nombre: true, usuario: true, rol: true, zona: true } as any,
    });
    // Supervisor nuevo: toma a cargo los vendedores de su región que aún no tienen supervisor.
    if (resto.rol === 'SUPERVISOR' && resto.regionId) {
      await (db as any).usuario.updateMany({
        where: { rol: 'VENDEDOR', regionId: resto.regionId, supervisorId: null },
        data: { supervisorId: u.id },
      });
    }
    res.status(201).json(u);
  } catch (e) { next(e); }
});

usuariosRouter.patch('/:id', async (req, res, next) => {
  try {
    const data: any = {};
    if (req.body.nombre) data.nombre = req.body.nombre;
    if (req.body.usuario !== undefined) data.usuario = String(req.body.usuario).toLowerCase().replace(/[@\s]/g, '');
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
    if (req.body.supervisorId !== undefined) data.supervisorId = req.body.supervisorId || null;
    // Cambio de canal (mixto↔focalizado↔mayorista↔viajero): recalcula el sufijo del ticket
    // (conserva CIUDAD-NN) y reasigna las listas de precio del canal.
    if (req.body.canal) {
      const actual = await db.usuario.findUnique({ where: { id: req.params.id }, select: { zona: true, ciudad: true } });
      const kLetra = canalCod(req.body.canal);
      const z = String(actual?.zona ?? '').toUpperCase();
      const nm = /^([A-Z])[MFYVSG](\d+)$/.exec(z);            // compacto: conserva ciudad y numero
      if (nm) data.zona = `${nm[1]}${kLetra}${nm[2]}`;
      else {
        const vm = /^([A-Z]{3})-(\d+)-[A-Z]{3}$/.exec(z);     // viejo -> migra a compacto, conserva numero
        data.zona = vm ? `${vm[1][0]}${kLetra}${parseInt(vm[2], 10)}` : await siguienteTicket(actual?.ciudad ?? req.body.ciudad ?? '', req.body.canal);
      }
      data.listasPrecios = kLetra === 'F' ? ['DROGUERIAS'] : ['GENERAL', 'MAYORISTA', 'TAT', 'DROGUERIAS'];
    }
    try {
      res.json(await db.usuario.update({
        where: { id: req.params.id }, data,
        select: { id: true, nombre: true, rol: true, activo: true },
      }));
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const campo = (e.meta?.target ?? []).includes('usuario') ? 'usuario de acceso (login)' : 'dato único';
        return res.status(400).json({ error: `Ya existe otro usuario con ese ${campo}.` });
      }
      throw e;
    }
  } catch (e) { next(e); }
});

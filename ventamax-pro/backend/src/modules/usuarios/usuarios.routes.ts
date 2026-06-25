import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
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
const CIU_COD: Record<string, string> = { ARMENIA: 'ARM', IBAGUE: 'IBG', PEREIRA: 'PER' };
const REG_CIU: Record<string, string> = { ARMENIA: 'QUINDIO', PEREIRA: 'QUINDIO', IBAGUE: 'TOLIMA' };
const sinTilde = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function ciudadCod(c?: string) { const u = sinTilde(String(c ?? '').trim().toUpperCase()); return CIU_COD[u] ?? u.slice(0, 3); }
function canalCod(c?: string) {
  const u = String(c ?? '').trim().toUpperCase();
  if (u.startsWith('MIX')) return 'MIX';
  if (u.startsWith('FOC')) return 'FOC';
  if (u.startsWith('MAY')) return 'MAY';
  if (u.startsWith('VIA')) return 'VIA';
  if (u.startsWith('SUP')) return 'SUP';
  return 'GEN';
}
async function siguienteTicket(ciudad?: string, canal?: string) {
  const ciu = ciudadCod(ciudad);
  const vendedores = await db.usuario.findMany({ where: { zona: { startsWith: ciu + '-' } }, select: { zona: true } });
  let max = 0;
  for (const v of vendedores) {
    const m = /^[A-Z]{3}-(\d+)-/.exec(String(v.zona ?? ''));
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return `${ciu}-${String(max + 1).padStart(2, '0')}-${canalCod(canal)}`;
}

export const usuariosRouter = Router();
usuariosRouter.use(requiereAuth, requiereRol('ADMIN', 'COADMIN', 'SUPERVISOR'));

// Previsualizar el ticket que se asignaría a un nuevo vendedor de esa ciudad/canal.
usuariosRouter.get('/siguiente-ticket', async (req, res, next) => {
  try {
    res.json({ ticket: await siguienteTicket(String(req.query.ciudad || ''), String(req.query.canal || '')) });
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
        const regName = REG_CIU[sinTilde(String(resto.ciudad).trim().toUpperCase())];
        if (regName) {
          let r = await (db as any).region.findUnique({ where: { nombre: regName } });
          if (!r) r = await (db as any).region.create({ data: { nombre: regName } });
          resto.regionId = r.id;
        }
      }
      if (!resto.listasPrecios) {
        resto.listasPrecios = canalCod(canalEf) === 'FOC' ? ['DROGUERIAS'] : ['GENERAL', 'MAYORISTA', 'TAT', 'DROGUERIAS'];
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
      const c3 = canalCod(req.body.canal);
      const m = /^([A-Z]{3})-(\d+)-/.exec(String(actual?.zona ?? ''));
      data.zona = m ? `${m[1]}-${m[2]}-${c3}` : await siguienteTicket(actual?.ciudad ?? req.body.ciudad ?? '', req.body.canal);
      data.listasPrecios = c3 === 'FOC' ? ['DROGUERIAS'] : ['GENERAL', 'MAYORISTA', 'TAT', 'DROGUERIAS'];
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

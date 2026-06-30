import { Prisma } from '@prisma/client';
import { db } from '../config/db';
import { metros } from '../modules/presencia/presencia.store';
import { enviarPush, enviarPushDetallado, pushDisponible } from './push';

// Margen de error de localización aceptado: el vendedor debe estar EN el punto de venta.
const UMBRAL_METROS = 120;

/**
 * Notifica al supervisor cuando el vendedor registra su PRIMERA tienda de la ruta
 * (venta o no compra), SOLO si la auditoría se cumple: la posición del vendedor
 * está a <= UMBRAL_METROS del punto de venta. Fire-and-forget.
 */
export function notificarInicioRuta(vendedorId: string, clienteId: string, tipo: 'venta' | 'no_compra') {
  (async () => {
    try {
      const v: any = await db.usuario.findUnique({ where: { id: vendedorId }, select: ({ nombre: true, supervisorId: true } as any) });
      const supId = v?.supervisorId;
      if (!supId) return; // sin supervisor asignado, no hay a quién notificar

      // ¿Es la PRIMERA operación del día de este vendedor?
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const [nVentas, nVisitas] = await Promise.all([
        db.factura.count({ where: { vendedorId, creadoEn: { gte: hoy }, estado: { not: 'ANULADA' }, tipoDoc: 'VENTA' } }),
        db.visita.count({ where: { vendedorId, creadoEn: { gte: hoy } } }),
      ]);
      if (nVentas + nVisitas !== 1) return; // ya había operaciones → no es la primera

      // Auditoría de ubicación.
      const cli = await db.cliente.findUnique({ where: { id: clienteId }, select: { nombre: true, lat: true, lng: true } });
      if (cli?.lat == null || cli?.lng == null) return; // sin ubicación del cliente no se puede auditar
      const hace = new Date(Date.now() - 5 * 60 * 1000);
      const pos = await db.ubicacion.findFirst({ where: { vendedorId, creadoEn: { gte: hace } }, orderBy: { creadoEn: 'desc' }, select: { lat: true, lng: true } });
      if (!pos) return; // sin posición reciente del vendedor → no se audita
      const dist = Math.round(metros(pos.lat, pos.lng, cli.lat, cli.lng));
      if (dist > UMBRAL_METROS) return; // el vendedor NO está en el punto → no cumple la auditoría

      const hora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      const tituloN = `Inicio de ruta: ${v.nombre}`;
      const detalleN = `Primera tienda: ${cli.nombre} · ${tipo === 'venta' ? 'Venta' : 'No compra'} · ${hora} · a ${dist} m del punto (ubicación auditada).`;
      await (db as any).notificacion.create({ data: { usuarioId: supId, tipo: 'INICIO_RUTA', titulo: tituloN, detalle: detalleN } });
      enviarPush([supId], tituloN, detalleN, { tipo: 'INICIO_RUTA' });
    } catch { /* noop */ }
  })();
}

/**
 * Notifica que se cargó inventario a una regional: al supervisor y vendedores de esa
 * regional y a todos los administradores. Fire-and-forget.
 */
export function notificarInventario(bodegaId: string, regionNombre: string | undefined, total: number) {
  (async () => {
    try {
      let region: any = await (db as any).region.findFirst({ where: { bodegaPrincipalId: bodegaId }, select: { id: true, nombre: true } });
      if (!region && regionNombre) {
        region = await (db as any).region.findUnique({ where: { nombre: String(regionNombre).trim().toUpperCase() }, select: { id: true, nombre: true } });
      }
      const nombre = region?.nombre ?? regionNombre ?? 'la regional';
      const filtros: any[] = [{ rol: { in: ['ADMIN', 'COADMIN'] } }];
      if (region?.id) filtros.push({ regionId: region.id, rol: { in: ['SUPERVISOR', 'VENDEDOR'] } });
      const users = await db.usuario.findMany({ where: ({ activo: true, OR: filtros } as any), select: { id: true } });
      if (!users.length) return;
      const hora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      const tituloI = `Inventario actualizado · ${nombre}`;
      const detalleI = `Se cargó inventario a ${nombre} · ${total} producto(s) · ${hora}.`;
      await (db as any).notificacion.createMany({
        data: users.map((u: any) => ({ usuarioId: u.id, tipo: 'INVENTARIO', titulo: tituloI, detalle: detalleI })),
      });
      enviarPush(users.map((u: any) => u.id), tituloI, detalleI, { tipo: 'INVENTARIO' });
    } catch { /* noop */ }
  })();
}


function fmtPesos(n: number): string { return '$' + Math.round(n).toLocaleString('es-CO'); }

// Inicio del dia de HOY en hora Colombia (UTC-5), expresado en UTC.
function inicioDiaColombiaUTC(): Date {
  const co = new Date(Date.now() - 5 * 3600 * 1000);
  return new Date(Date.UTC(co.getUTCFullYear(), co.getUTCMonth(), co.getUTCDate(), 5, 0, 0, 0));
}

/**
 * Envia a cada supervisor un push con el avance de HOY de sus vendedores asignados:
 * clientes visitados, clientes impactados y dinero. Lo dispara la tarea (10am, 12m, 4pm).
 */
export async function enviarResumenSupervisores(): Promise<any> {
  const desde = inicioDiaColombiaUTC();
  const hasta = new Date();
  const hora = hasta.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: true });
  const sups = await db.usuario.findMany({ where: ({ rol: 'SUPERVISOR', activo: true } as any), select: { id: true, nombre: true } });
  const firebase = pushDisponible();
  const totalDispositivos = await (db as any).dispositivo.count();
  const detalle: any[] = [];
  let enviados = 0;
  for (const sup of sups) {
    const vendedores = await db.usuario.findMany({ where: ({ rol: 'VENDEDOR', activo: true, supervisorId: sup.id } as any), select: { id: true, nombre: true } });
    if (!vendedores.length) continue;
    const ids = vendedores.map((v: any) => v.id);
    const facRows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT f."vendedorId" AS id,
             COALESCE(SUM(f.total),0)::float AS dinero,
             COUNT(*) FILTER (WHERE f."tipoDoc" = 'VENTA')::int AS pedidos,
             COUNT(DISTINCT f."clienteId") FILTER (WHERE f."tipoDoc" = 'VENTA')::int AS impactados
      FROM facturas f
      WHERE f."vendedorId" IN (${Prisma.join(ids)}) AND f.estado <> 'ANULADA'
        AND f."creadoEn" >= ${desde} AND f."creadoEn" <= ${hasta}
      GROUP BY f."vendedorId"`);
    const visRows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT "vendedorId" AS id, COUNT(DISTINCT "clienteId")::int AS visitados FROM (
        SELECT f."vendedorId", f."clienteId" FROM facturas f
          WHERE f."vendedorId" IN (${Prisma.join(ids)}) AND f.estado <> 'ANULADA' AND f."tipoDoc" = 'VENTA'
            AND f."creadoEn" >= ${desde} AND f."creadoEn" <= ${hasta}
        UNION
        SELECT v."vendedorId", v."clienteId" FROM visitas v
          WHERE v."vendedorId" IN (${Prisma.join(ids)})
            AND v."creadoEn" >= ${desde} AND v."creadoEn" <= ${hasta}
      ) t GROUP BY "vendedorId"`);
    const fMap = new Map<string, any>(facRows.map((r: any) => [r.id, r]));
    const vMap = new Map<string, number>(visRows.map((r: any) => [r.id, Number(r.visitados) || 0]));
    let totalDinero = 0, totalPedidos = 0, totalImp = 0;
    const lineas = vendedores.map((v: any) => {
      const f = fMap.get(v.id) ?? { dinero: 0, impactados: 0, pedidos: 0 };
      const vis = vMap.get(v.id) ?? 0;
      const dinero = Number(f.dinero) || 0;
      const imp = Number(f.impactados) || 0;
      const ped = Number(f.pedidos) || 0;
      totalDinero += dinero; totalPedidos += ped; totalImp += imp;
      return `• ${String(v.nombre).split(' ')[0]}: ${vis} visit · ${imp} imp · ${ped} ped · ${fmtPesos(dinero)}`;
    });
    const titulo = `Avance del equipo · ${hora}`;
    const cuerpo = lineas.join('\n') + `\nTOTAL: ${totalImp} imp · ${totalPedidos} ped · ${fmtPesos(totalDinero)}`;
    try { await (db as any).notificacion.create({ data: { usuarioId: sup.id, tipo: 'RESUMEN_EQUIPO', titulo, detalle: cuerpo } }); } catch { /* noop */ }
    const det = await enviarPushDetallado([sup.id], titulo, cuerpo, { tipo: 'RESUMEN_EQUIPO' });
    detalle.push({ supervisor: sup.nombre, vendedores: vendedores.length, dispositivos: det.tokens, exitos: det.exitos, fallos: det.fallos, errores: det.errores });
    enviados++;
  }
  return { supervisores: sups.length, enviados, firebase, totalDispositivos, detalle };
}

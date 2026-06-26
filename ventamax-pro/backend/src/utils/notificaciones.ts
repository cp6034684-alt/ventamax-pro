import { db } from '../config/db';
import { metros } from '../modules/presencia/presencia.store';

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
      await (db as any).notificacion.create({
        data: {
          usuarioId: supId, tipo: 'INICIO_RUTA',
          titulo: `Inicio de ruta: ${v.nombre}`,
          detalle: `Primera tienda: ${cli.nombre} · ${tipo === 'venta' ? 'Venta' : 'No compra'} · ${hora} · a ${dist} m del punto (ubicación auditada).`,
        },
      });
    } catch { /* noop */ }
  })();
}

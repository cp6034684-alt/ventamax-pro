import { db } from '../../config/db';

// ── Store en memoria de presencia + última ubicación ──────────────────
// Cada usuario en campo manda un "latido" cada ~20s con su GPS. Guardamos:
//  - la última posición (para el mapa en vivo), y
//  - una "miga de pan" en la base SOLO cuando se desplaza >= MIN_METROS,
//    para reconstruir el recorrido del día sin llenar la base de puntos.
// Al ser en memoria, la presencia es por instancia del servidor.

export const VENTANA_MS = 45_000; // 45s sin latido → desconectado
const MIN_METROS = 30; // distancia mínima para guardar un nuevo punto del recorrido

// Roles que se rastrean en campo.
export const ROLES_CAMPO = ['VENDEDOR', 'SUPERVISOR'];

export interface Presencia {
  id: string;
  nombre: string;
  rol: string;
  ultimoLatido: number;
  lat?: number;
  lng?: number;
  latGuardada?: number;
  lngGuardada?: number;
}

export const enLinea = new Map<string, Presencia>();

/** Distancia en metros entre dos coordenadas (haversine). */
export function metros(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Registra un latido (presencia + ubicación) y persiste el recorrido si corresponde. */
export async function registrarLatido(
  u: { id: string; nombre: string; rol: string },
  lat?: number,
  lng?: number,
): Promise<void> {
  const prev = enLinea.get(u.id);
  const reg: Presencia = {
    id: u.id,
    nombre: u.nombre,
    rol: u.rol,
    ultimoLatido: Date.now(),
    lat: lat ?? prev?.lat,
    lng: lng ?? prev?.lng,
    latGuardada: prev?.latGuardada,
    lngGuardada: prev?.lngGuardada,
  };
  enLinea.set(u.id, reg);

  // Persistir una miga de pan solo para roles de campo y solo si se movió.
  if (lat != null && lng != null && ROLES_CAMPO.includes(u.rol)) {
    const movido =
      reg.latGuardada == null ||
      reg.lngGuardada == null ||
      metros(reg.latGuardada, reg.lngGuardada, lat, lng) >= MIN_METROS;
    if (movido) {
      reg.latGuardada = lat;
      reg.lngGuardada = lng;
      try {
        await db.ubicacion.create({ data: { vendedorId: u.id, lat, lng } });
      } catch {
        // No interrumpir el latido si falla el guardado del punto.
      }
    }
  }
}

/** Usuarios en línea ahora mismo (limpia los vencidos de forma perezosa). */
export function online(): Presencia[] {
  const ahora = Date.now();
  for (const [id, l] of enLinea) {
    if (ahora - l.ultimoLatido > VENTANA_MS) enLinea.delete(id);
  }
  return Array.from(enLinea.values());
}

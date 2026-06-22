import { db } from '../config/db';

// Registra un evento de actividad sin bloquear ni romper la peticion (fire-and-forget).
export function registrarActividad(usuarioId: string | null | undefined, tipo: string, detalle?: string | null) {
  (db as any).actividad
    .create({ data: { usuarioId: usuarioId ?? null, tipo, detalle: detalle ?? null } })
    .catch(() => {});
}

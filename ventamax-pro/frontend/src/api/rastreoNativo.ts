// Rastreo en segundo plano para la app NATIVA (Opción A · plugin libre
// @capacitor-community/background-geolocation). En navegador normal NO hace nada.
// Reutiliza el endpoint de presencia que ya tiene el backend.
import { registerPlugin } from '@capacitor/core';
import { presenciaApi } from '../api/servicios';

const BG = registerPlugin<any>('BackgroundGeolocation');
let watcherId: string | null = null;

// ¿Estamos dentro de la app nativa? (Capacitor inyecta window.Capacitor)
function esNativo(): boolean {
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

/** Inicia el rastreo en segundo plano (llamar tras iniciar sesión un rol de campo). */
export async function iniciarRastreoNativo() {
  if (!esNativo() || watcherId) return;
  watcherId = await BG.addWatcher(
    {
      backgroundTitle: 'VentaMax Pro',
      backgroundMessage: 'Rastreo de ruta activo',
      requestPermissions: true, // pide "Permitir siempre"
      stale: false,
      distanceFilter: 30, // guarda un punto cada ~30 m
    },
    (location: any, error: any) => {
      if (error || !location) return;
      // Envía la ubicación al servidor (mismo recorrido que ya ves en el panel).
      presenciaApi.latido({ lat: location.latitude, lng: location.longitude }).catch(() => {});
    },
  );
}

/** Detiene el rastreo (al cerrar sesión). */
export async function detenerRastreoNativo() {
  if (watcherId) { try { await BG.removeWatcher({ id: watcherId }); } catch { /* noop */ } watcherId = null; }
}

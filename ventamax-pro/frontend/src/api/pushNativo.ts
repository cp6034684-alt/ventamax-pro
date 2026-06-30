// Push (Firebase) para la app NATIVA. En navegador normal no hace nada.
// Usa @capacitor/push-notifications (presente en el APK); en web se ignora.
import { registerPlugin } from '@capacitor/core';
import { dispositivosApi } from './servicios';

const Push = registerPlugin<any>('PushNotifications');
function esNativo(): boolean { return !!(window as any).Capacitor?.isNativePlatform?.(); }

let registrado = false;
let ultimoToken: string | null = null;

/** Pide permiso de notificaciones, registra el dispositivo y envía el token al servidor. */
export async function iniciarPush() {
  if (!esNativo() || registrado) return;
  registrado = true;
  try {
    let perm = await Push.checkPermissions();
    if (perm.receive !== 'granted') perm = await Push.requestPermissions();
    if (perm.receive !== 'granted') { registrado = false; return; }
    Push.addListener('registration', (t: any) => {
      if (t?.value) { ultimoToken = t.value; dispositivosApi.registrar(t.value, 'android').catch(() => {}); }
    });
    Push.addListener('registrationError', () => {});
    await Push.register();
  } catch { registrado = false; }
}

/** Quita el token de este dispositivo (al cerrar sesión). */
export function detenerPush() {
  if (ultimoToken) dispositivosApi.eliminar(ultimoToken).catch(() => {});
}

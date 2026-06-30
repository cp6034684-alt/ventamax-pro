/* eslint-disable @typescript-eslint/no-var-requires */
import { db } from '../config/db';

// Inicializa Firebase Admin solo si FIREBASE_SERVICE_ACCOUNT está configurado.
let fa: any = null;
let intentado = false;
function admin(): any | null {
  if (fa) return fa;
  if (intentado) return null;
  intentado = true;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const mod = require('firebase-admin');
    if (!mod.apps.length) mod.initializeApp({ credential: mod.credential.cert(JSON.parse(raw)) });
    fa = mod;
    return fa;
  } catch (e) {
    console.error('Push: no se pudo inicializar firebase-admin', e);
    return null;
  }
}

/** Envía un push a todos los dispositivos de los usuarios indicados. Fire-and-forget. */
export function enviarPush(usuarioIds: string[], titulo: string, cuerpo: string, data?: Record<string, string>) {
  (async () => {
    const mod = admin();
    if (!mod || !usuarioIds.length) return;
    try {
      const filas = await (db as any).dispositivo.findMany({ where: { usuarioId: { in: usuarioIds } }, select: { token: true } });
      const tokens = [...new Set(filas.map((f: any) => f.token).filter(Boolean))] as string[];
      if (!tokens.length) return;
      const resp = await mod.messaging().sendEachForMulticast({
        notification: { title: titulo, body: cuerpo },
        data: data ?? {},
        android: { priority: 'high', notification: { sound: 'default' } },
        tokens,
      });
      // Limpia tokens inválidos para no acumular basura.
      const invalidos: string[] = [];
      resp.responses.forEach((r: any, i: number) => {
        const code = r?.error?.code;
        if (!r.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token')) {
          invalidos.push(tokens[i]);
        }
      });
      if (invalidos.length) await (db as any).dispositivo.deleteMany({ where: { token: { in: invalidos } } });
    } catch (e) {
      console.error('Push: error enviando', e);
    }
  })();
}

/** Indica si firebase-admin pudo inicializarse (FIREBASE_SERVICE_ACCOUNT valido). */
export function pushDisponible(): boolean { return admin() != null; }

/** Igual que enviarPush pero AWAITABLE y con resultado detallado (para diagnostico). */
export async function enviarPushDetallado(
  usuarioIds: string[], titulo: string, cuerpo: string, data?: Record<string, string>,
): Promise<{ firebase: boolean; tokens: number; exitos: number; fallos: number; errores: string[] }> {
  const mod = admin();
  if (!mod) return { firebase: false, tokens: 0, exitos: 0, fallos: 0, errores: ['firebase-admin no inicializado (revisa FIREBASE_SERVICE_ACCOUNT)'] };
  if (!usuarioIds.length) return { firebase: true, tokens: 0, exitos: 0, fallos: 0, errores: [] };
  const filas = await (db as any).dispositivo.findMany({ where: { usuarioId: { in: usuarioIds } }, select: { token: true } });
  const tokens = [...new Set(filas.map((f: any) => f.token).filter(Boolean))] as string[];
  if (!tokens.length) return { firebase: true, tokens: 0, exitos: 0, fallos: 0, errores: [] };
  try {
    const resp = await mod.messaging().sendEachForMulticast({
      notification: { title: titulo, body: cuerpo }, data: data ?? {},
      android: { priority: 'high', notification: { sound: 'default' } }, tokens,
    });
    const errores: string[] = [];
    const invalidos: string[] = [];
    resp.responses.forEach((r: any, i: number) => {
      if (!r.success) {
        const code = r?.error?.code || r?.error?.message || 'error';
        errores.push(String(code));
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') invalidos.push(tokens[i]);
      }
    });
    if (invalidos.length) await (db as any).dispositivo.deleteMany({ where: { token: { in: invalidos } } });
    return { firebase: true, tokens: tokens.length, exitos: resp.successCount, fallos: resp.failureCount, errores };
  } catch (e: any) {
    return { firebase: true, tokens: tokens.length, exitos: 0, fallos: tokens.length, errores: [String(e?.message || e)] };
  }
}


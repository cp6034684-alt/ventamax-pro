/**
 * Cliente HTTP único. Toda llamada al backend pasa por aquí:
 * agrega el token JWT, maneja errores y el 401 (sesión vencida).
 */
const BASE = import.meta.env.VITE_API_URL ?? '/api';

let _token: string | null = sessionStorage.getItem('vm_token');
let _alExpirar: (() => void) | null = null;

export function setToken(t: string | null) {
  _token = t;
  if (t) sessionStorage.setItem('vm_token', t);
  else sessionStorage.removeItem('vm_token');
}
export function getToken() { return _token; }
export function onSesionExpirada(cb: () => void) { _alExpirar = cb; }

export async function api<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
      ...opciones.headers,
    },
  });

  if (res.status === 401) {
    setToken(null);
    _alExpirar?.();
    throw new Error('Sesión expirada. Inicia sesión de nuevo.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data as T;
}

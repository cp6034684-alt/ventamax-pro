import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { setToken, getToken, onSesionExpirada } from '../api/client';
import { authApi } from '../api/servicios';
import type { Usuario } from '../api/tipos';

interface AuthCtx {
  usuario: Usuario | null;
  iniciarSesion: (token: string, usuario: Usuario) => void;
  cerrarSesion: () => void;
}

const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    const guardado = sessionStorage.getItem('vm_usuario');
    return guardado && getToken() ? JSON.parse(guardado) : null;
  });

  useEffect(() => { onSesionExpirada(() => setUsuario(null)); }, []);

  const iniciarSesion = (token: string, u: Usuario) => {
    setToken(token);
    sessionStorage.setItem('vm_usuario', JSON.stringify(u));
    setUsuario(u);
  };

  const cerrarSesion = () => {
    // Registra el cierre de sesion con el token actual antes de limpiarlo (fire-and-forget).
    authApi.logout().catch(() => {});
    setToken(null);
    sessionStorage.removeItem('vm_usuario');
    setUsuario(null);
  };

  return <Ctx.Provider value={{ usuario, iniciarSesion, cerrarSesion }}>{children}</Ctx.Provider>;
}

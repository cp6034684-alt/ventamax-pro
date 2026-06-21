import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { Rol } from '../api/tipos';

/** Bloquea rutas sin sesión y, opcionalmente, por rol. */
export function RutaProtegida({ roles }: { roles?: Rol[] }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(usuario.rol)) return <Navigate to="/" replace />;
  return <Outlet />;
}

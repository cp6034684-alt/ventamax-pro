import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { Rol } from '../api/tipos';

interface NavItem { ruta: string; icono: string; etiqueta: string; }

/** Cada rol ve solo lo que usa en campo; todo lo demás vive en "Más". */
const NAV_POR_ROL: Record<Rol, NavItem[]> = {
  VENDEDOR: [
    { ruta: '/', icono: '📊', etiqueta: 'INICIO' },
    { ruta: '/venta', icono: '🧾', etiqueta: 'VENDER' },
    { ruta: '/clientes', icono: '👥', etiqueta: 'CLIENTES' },
    { ruta: '/mapa', icono: '🗺', etiqueta: 'MAPA' },
    { ruta: '/mas', icono: '☰', etiqueta: 'MÁS' },
  ],
  ENTREGADOR: [
    { ruta: '/entregas', icono: '🚚', etiqueta: 'ENTREGAS' },
    { ruta: '/facturas', icono: '🧾', etiqueta: 'HISTORIAL' },
    { ruta: '/mapa', icono: '🗺', etiqueta: 'MAPA' },
    { ruta: '/perfil', icono: '⚙️', etiqueta: 'PERFIL' },
  ],
  ADMIN: [
    { ruta: '/', icono: '📊', etiqueta: 'INICIO' },
    { ruta: '/venta', icono: '🧾', etiqueta: 'VENDER' },
    { ruta: '/clientes', icono: '👥', etiqueta: 'CLIENTES' },
    { ruta: '/reportes', icono: '📈', etiqueta: 'REPORTES' },
    { ruta: '/mas', icono: '☰', etiqueta: 'MÁS' },
  ],
  COADMIN: [
    { ruta: '/', icono: '📊', etiqueta: 'INICIO' },
    { ruta: '/venta', icono: '🧾', etiqueta: 'VENDER' },
    { ruta: '/clientes', icono: '👥', etiqueta: 'CLIENTES' },
    { ruta: '/reportes', icono: '📈', etiqueta: 'REPORTES' },
    { ruta: '/mas', icono: '☰', etiqueta: 'MÁS' },
  ],
};

const TITULOS: Record<string, string> = {
  '/': 'Inicio', '/venta': 'Nueva venta', '/clientes': 'Clientes', '/productos': 'Productos',
  '/inventario': 'Inventario', '/proveedores': 'Proveedores', '/mapa': 'Mapa de rutas',
  '/entregas': 'Entregas', '/reportes': 'Reportes', '/importar': 'Importar Excel',
  '/gastos': 'Gastos', '/usuarios': 'Usuarios', '/perfil': 'Mi perfil',
  '/facturas': 'Facturas', '/mas': 'Más opciones',
};

const navStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  flex: 1, textAlign: 'center', padding: '9px 2px', textDecoration: 'none',
  color: isActive ? 'var(--accent)' : 'var(--muted)',
  fontSize: 9, fontWeight: 700, letterSpacing: '.5px', lineHeight: 1.7,
});

export function Layout() {
  const { usuario } = useAuth();
  const { pathname } = useLocation();
  const items = usuario ? NAV_POR_ROL[usuario.rol] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        borderBottom: '1px solid var(--border)', background: 'rgba(7,16,31,.96)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center',
          background: 'linear-gradient(135deg, var(--accent), #0044ff)', fontSize: 15,
        }}>⚡</div>
        <strong style={{ flex: 1, fontSize: 15 }}>{TITULOS[pathname] ?? 'VentaMax Pro'}</strong>
        <NavLink to="/perfil" style={{ textDecoration: 'none' }}>
          <span className="muted" style={{ fontSize: 12 }}>{usuario?.nombre.split(' ')[0]}</span>
        </NavLink>
      </header>

      <main style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        <Outlet />
      </main>

      <nav style={{ display: 'flex', borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
        {items.map(i => (
          <NavLink key={i.ruta} to={i.ruta} end={i.ruta === '/'} style={navStyle}>
            <span style={{ fontSize: 17 }}>{i.icono}</span><br />{i.etiqueta}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

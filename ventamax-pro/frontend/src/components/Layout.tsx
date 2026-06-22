import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { presenciaApi } from '../api/servicios';
import type { Rol } from '../api/tipos';

interface NavItem { ruta: string; icono: string; etiqueta: string; }

/** Cada rol ve solo lo que usa en campo; todo lo demás vive en "Más". */
const NAV_POR_ROL: Record<Rol, NavItem[]> = {
  VENDEDOR: [
    { ruta: '/', icono: '📊', etiqueta: 'INICIO' },
    { ruta: '/venta', icono: '🧾', etiqueta: 'VENDER' },
    { ruta: '/clientes', icono: '👥', etiqueta: 'CLIENTES' },
    { ruta: '/mi-inventario', icono: '📦', etiqueta: 'INVENTARIO' },
    { ruta: '/mapa', icono: '🗺', etiqueta: 'MAPA' },
    { ruta: '/indicadores', icono: '📈', etiqueta: 'INDICADORES' },
  ],
  ENTREGADOR: [
    { ruta: '/entregas', icono: '🚚', etiqueta: 'ENTREGAS' },
    { ruta: '/facturas', icono: '🧾', etiqueta: 'HISTORIAL' },
    { ruta: '/mapa', icono: '🗺', etiqueta: 'MAPA' },
    { ruta: '/perfil', icono: '⚙️', etiqueta: 'PERFIL' },
  ],
  SUPERVISOR: [
    { ruta: '/', icono: '📊', etiqueta: 'INICIO' },
    { ruta: '/venta', icono: '🧾', etiqueta: 'VENDER' },
    { ruta: '/clientes', icono: '👥', etiqueta: 'CLIENTES' },
    { ruta: '/rastreo', icono: '📍', etiqueta: 'RASTREO' },
    { ruta: '/reportes', icono: '📈', etiqueta: 'REPORTES' },
    { ruta: '/mas', icono: '☰', etiqueta: 'MÁS' },
  ],
  ADMIN: [
    { ruta: '/', icono: '📊', etiqueta: 'INICIO' },
    { ruta: '/clientes', icono: '👥', etiqueta: 'CLIENTES' },
    { ruta: '/inventario', icono: '📦', etiqueta: 'INVENTARIO' },
    { ruta: '/rastreo', icono: '📍', etiqueta: 'RASTREO' },
    { ruta: '/reportes', icono: '📈', etiqueta: 'REPORTES' },
    { ruta: '/mas', icono: '☰', etiqueta: 'MÁS' },
  ],
  COADMIN: [
    { ruta: '/', icono: '📊', etiqueta: 'INICIO' },
    { ruta: '/clientes', icono: '👥', etiqueta: 'CLIENTES' },
    { ruta: '/inventario', icono: '📦', etiqueta: 'INVENTARIO' },
    { ruta: '/rastreo', icono: '📍', etiqueta: 'RASTREO' },
    { ruta: '/reportes', icono: '📈', etiqueta: 'REPORTES' },
    { ruta: '/mas', icono: '☰', etiqueta: 'MÁS' },
  ],
};

const TITULOS: Record<string, string> = {
  '/': 'Inicio', '/venta': 'Nueva venta', '/clientes': 'Clientes', '/productos': 'Productos',
  '/inventario': 'Inventario', '/proveedores': 'Proveedores', '/mapa': 'Mapa de rutas',
  '/entregas': 'Entregas', '/reportes': 'Reportes', '/importar': 'Importar Excel',
  '/gastos': 'Gastos', '/usuarios': 'Usuarios', '/perfil': 'Mi perfil',
  '/facturas': 'Facturas', '/mas': 'Más opciones', '/rastreo': 'Rastreo', '/indicadores': 'Indicadores', '/mi-inventario': 'Mi inventario',
};

const navStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  flex: 1, textAlign: 'center', padding: '9px 2px', textDecoration: 'none',
  color: isActive ? 'var(--accent)' : 'var(--muted)',
  fontSize: 9, fontWeight: 700, letterSpacing: '.5px', lineHeight: 1.7,
});

export function Layout() {
  const { usuario, cerrarSesion } = useAuth();
  const { pathname } = useLocation();
  const items = usuario ? NAV_POR_ROL[usuario.rol] : [];

  // Heartbeat de presencia: avisa al servidor que este usuario sigue
  // activo cada 20s mientras la sesión está abierta. Alimenta la barra
  // "En línea" del dashboard y, para roles de campo, el rastreo:
  // se envía el GPS en cada latido (el servidor guarda el recorrido).
  useEffect(() => {
    if (!usuario) return;
    const coords: { actual?: { lat: number; lng: number } } = {};
    const esCampo = usuario.rol === 'VENDEDOR' || usuario.rol === 'SUPERVISOR';
    let watchId: number | undefined;
    if (esCampo && 'geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        pos => { coords.actual = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
        () => {}, // sin permiso de GPS: seguimos marcando presencia sin ubicación
        { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
      );
    }
    const latir = () => { presenciaApi.latido(coords.actual).catch(() => {}); };
    latir();
    const t = setInterval(latir, 20_000);
    return () => {
      clearInterval(t);
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, [usuario]);

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
        <span className="muted" style={{ fontSize: 12 }}>{usuario?.nombre.split(' ')[0]}</span>
        <NavLink to="/perfil" title="Mi perfil" style={{ textDecoration: 'none', fontSize: 18, lineHeight: 1 }}>⚙️</NavLink>
        <button onClick={cerrarSesion} title="Cerrar sesión" aria-label="Cerrar sesión"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: 'var(--red)', padding: 0 }}>⏻</button>
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

import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import type { Rol } from '../../api/tipos';

interface Item { ruta: string; icono: string; titulo: string; descripcion: string; roles: Rol[]; }

const TODOS: Rol[] = ['ADMIN', 'COADMIN', 'SUPERVISOR', 'VENDEDOR', 'ENTREGADOR'];
const ADMINS: Rol[] = ['ADMIN', 'COADMIN'];
const GESTION: Rol[] = ['ADMIN', 'COADMIN', 'SUPERVISOR'];
const CONSULTA: Rol[] = ['ADMIN', 'COADMIN', 'SUPERVISOR', 'VENDEDOR'];
const SIN_VENDEDOR: Rol[] = ['ADMIN', 'COADMIN', 'SUPERVISOR', 'ENTREGADOR']; // todos menos vendedor

const MODULOS: Item[] = [
  { ruta: '/facturas',    icono: '🧾', titulo: 'Facturas',    descripcion: 'Historial, recibos, abonos y anulaciones', roles: SIN_VENDEDOR },
  { ruta: '/productos',   icono: '📦', titulo: 'Productos',   descripcion: 'Catálogo y precios', roles: ADMINS },
  { ruta: '/inventario',  icono: '📊', titulo: 'Inventario',  descripcion: 'Stock bajo, entradas y ajustes', roles: ADMINS },
  { ruta: '/proveedores', icono: '🏭', titulo: 'Proveedores', descripcion: 'Directorio de proveedores', roles: ADMINS },
  { ruta: '/bodegas',     icono: '🏬', titulo: 'Bodegas',     descripcion: 'Crear bodegas y asignarlas a una región', roles: ADMINS },
  { ruta: '/mapa',        icono: '🗺', titulo: 'Mapa de rutas', descripcion: 'Clientes geolocalizados por día de visita', roles: SIN_VENDEDOR },
  { ruta: '/rastreo',     icono: '📍', titulo: 'Rastreo',      descripcion: 'Ubicación en vivo y recorrido del día por vendedor', roles: GESTION },
  { ruta: '/indicadores', icono: '📊', titulo: 'Indicadores',  descripcion: 'Venta, dropsize, efectividad, unidades por marca', roles: CONSULTA },
  { ruta: '/devoluciones', icono: '↩️', titulo: 'Devoluciones', descripcion: 'Registrar devolución total/parcial sobre una venta', roles: GESTION },
  { ruta: '/entregas',    icono: '🚚', titulo: 'Entregas',    descripcion: 'Cola de logística: entregar, devolución y recibo', roles: GESTION },
  { ruta: '/reportes',    icono: '📈', titulo: 'Reportes',    descripcion: 'Ventas, ranking, cartera y exportar a Excel', roles: GESTION },
  { ruta: '/importar',    icono: '📥', titulo: 'Importar Excel', descripcion: 'Carga masiva de clientes y productos', roles: ADMINS },
  { ruta: '/duplicados',  icono: '🧹', titulo: 'Clientes duplicados', descripcion: 'Detectar y fusionar clientes con el mismo NIT', roles: ADMINS },
  { ruta: '/usuarios',    icono: '👤', titulo: 'Usuarios',    descripcion: 'Vendedores, entregadores y permisos', roles: GESTION },
  { ruta: '/perfil',      icono: '⚙️', titulo: 'Mi perfil',   descripcion: 'Cambiar PIN y cerrar sesión', roles: TODOS },
];

export function MasPage() {
  const { usuario } = useAuth();
  const visibles = MODULOS.filter(m => usuario && m.roles.includes(usuario.rol));

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', display: 'grid', gap: 10 }}>
      {visibles.map(m => (
        <Link key={m.ruta} to={m.ruta} className="card"
          style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', textDecoration: 'none', color: 'var(--text)' }}>
          <span style={{ fontSize: 24 }}>{m.icono}</span>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 14 }}>{m.titulo}</strong>
            <div className="muted" style={{ fontSize: 12 }}>{m.descripcion}</div>
          </div>
          <span style={{ color: 'var(--border)' }}>›</span>
        </Link>
      ))}
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import type { Rol } from '../../api/tipos';

interface Item { ruta: string; icono: string; titulo: string; descripcion: string; roles: Rol[]; }

const TODOS: Rol[] = ['ADMIN', 'COADMIN', 'VENDEDOR', 'ENTREGADOR'];
const ADMINS: Rol[] = ['ADMIN', 'COADMIN'];

const MODULOS: Item[] = [
  { ruta: '/facturas',    icono: '🧾', titulo: 'Facturas',    descripcion: 'Historial, recibos, abonos y anulaciones', roles: TODOS },
  { ruta: '/gastos',      icono: '💸', titulo: 'Gastos',      descripcion: 'Registrar y consultar gastos', roles: ['ADMIN', 'COADMIN', 'VENDEDOR'] },
  { ruta: '/productos',   icono: '📦', titulo: 'Productos',   descripcion: 'Catálogo y precios', roles: TODOS },
  { ruta: '/inventario',  icono: '📊', titulo: 'Inventario',  descripcion: 'Stock bajo, entradas y ajustes', roles: ADMINS },
  { ruta: '/proveedores', icono: '🏭', titulo: 'Proveedores', descripcion: 'Directorio de proveedores', roles: ADMINS },
  { ruta: '/mapa',        icono: '🗺', titulo: 'Mapa de rutas', descripcion: 'Clientes geolocalizados por día de visita', roles: TODOS },
  { ruta: '/entregas',    icono: '🚚', titulo: 'Entregas',    descripcion: 'Cola de entregas pendientes', roles: ADMINS },
  { ruta: '/reportes',    icono: '📈', titulo: 'Reportes',    descripcion: 'Ventas, ranking, cartera y exportar a Excel', roles: ADMINS },
  { ruta: '/importar',    icono: '📥', titulo: 'Importar Excel', descripcion: 'Carga masiva de clientes y productos', roles: ADMINS },
  { ruta: '/usuarios',    icono: '👤', titulo: 'Usuarios',    descripcion: 'Vendedores, entregadores y permisos', roles: ADMINS },
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

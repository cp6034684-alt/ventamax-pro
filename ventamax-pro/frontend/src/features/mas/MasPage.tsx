import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import type { Rol } from '../../api/tipos';

interface Item { ruta: string; icono: string; titulo: string; descripcion: string; roles: Rol[]; }

const TODOS: Rol[] = ['ADMIN', 'COADMIN', 'SUPERVISOR', 'VENDEDOR', 'ENTREGADOR'];
const ADMINS: Rol[] = ['ADMIN', 'COADMIN'];
const GESTION: Rol[] = ['ADMIN', 'COADMIN', 'SUPERVISOR'];
const CONSULTA: Rol[] = ['ADMIN', 'COADMIN', 'SUPERVISOR', 'VENDEDOR'];
// Para modulos que NO deben aparecer en "Mas" de los administradores (los tienen en otro lado).
const SUP_ENTREGADOR: Rol[] = ['SUPERVISOR', 'ENTREGADOR'];
const SOLO_SUPERVISOR: Rol[] = ['SUPERVISOR'];
const SIN_ADMIN: Rol[] = ['SUPERVISOR', 'VENDEDOR', 'ENTREGADOR']; // todos menos administradores

const MODULOS: Item[] = [
  { ruta: '/facturas',    icono: '🧾', titulo: 'Facturas',    descripcion: 'Historial, recibos, abonos y anulaciones', roles: SUP_ENTREGADOR },
  { ruta: '/productos',   icono: '📦', titulo: 'Productos',   descripcion: 'Catalogo y precios', roles: ADMINS },
  { ruta: '/proveedores', icono: '🏭', titulo: 'Proveedores', descripcion: 'Directorio de proveedores', roles: SOLO_SUPERVISOR },
  { ruta: '/bodegas',     icono: '🏬', titulo: 'Bodegas',     descripcion: 'Crear bodegas y asignarlas a una region', roles: ADMINS },
  { ruta: '/mapa',        icono: '🗺', titulo: 'Mapa de rutas', descripcion: 'Clientes geolocalizados por dia de visita', roles: ['ADMIN', 'COADMIN', 'SUPERVISOR', 'ENTREGADOR'] },
  { ruta: '/rastreo',     icono: '📍', titulo: 'Rastreo',      descripcion: 'Ubicacion en vivo y recorrido del dia por vendedor', roles: SOLO_SUPERVISOR },
  { ruta: '/indicadores', icono: '📊', titulo: 'Indicadores',  descripcion: 'Venta, dropsize, efectividad, unidades por marca', roles: CONSULTA },
  { ruta: '/devoluciones', icono: '↩️', titulo: 'Devoluciones', descripcion: 'Registrar devolucion total/parcial sobre una venta', roles: SOLO_SUPERVISOR },
  { ruta: '/entregas',    icono: '🚚', titulo: 'Entregas',    descripcion: 'Cola de logistica: entregar, devolucion y recibo', roles: SOLO_SUPERVISOR },
  { ruta: '/reportes',    icono: '📈', titulo: 'Reportes',    descripcion: 'Ventas, ranking, cartera y exportar a Excel', roles: SOLO_SUPERVISOR },
  { ruta: '/importar',    icono: '📥', titulo: 'Importar Excel', descripcion: 'Carga masiva de clientes y productos', roles: ADMINS },
  { ruta: '/duplicados',  icono: '🧹', titulo: 'Clientes duplicados', descripcion: 'Detectar y fusionar clientes con el mismo NIT', roles: ADMINS },
  { ruta: '/usuarios',    icono: '👤', titulo: 'Usuarios',    descripcion: 'Vendedores, entregadores y permisos', roles: GESTION },
  { ruta: '/perfil',      icono: '⚙️', titulo: 'Mi perfil',   descripcion: 'Cambiar PIN y cerrar sesion', roles: SIN_ADMIN },
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

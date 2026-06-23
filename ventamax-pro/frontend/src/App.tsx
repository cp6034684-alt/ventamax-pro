import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { RutaProtegida } from './auth/RutaProtegida';
import { Layout } from './components/Layout';
import { LoginPage } from './features/login/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { DashboardEjecutivoPage } from './features/dashboard/DashboardEjecutivoPage';
import { ClientesPage } from './features/clientes/ClientesPage';
import { VentaPage } from './features/venta/VentaPage';
import { ProductosPage } from './features/productos/ProductosPage';
import { InventarioPage } from './features/inventario/InventarioPage';
import { MiInventarioPage } from './features/inventario/MiInventarioPage';
import { ProveedoresPage } from './features/proveedores/ProveedoresPage';
import { MapaPage } from './features/mapa/MapaPage';
import { EntregadorPage } from './features/entregador/EntregadorPage';
import { ImportarPage } from './features/importar/ImportarPage';
import { ReportesPage } from './features/reportes/ReportesPage';
import { UsuariosPage } from './features/usuarios/UsuariosPage';
import { PerfilPage } from './features/perfil/PerfilPage';
import { FacturasPage } from './features/facturas/FacturasPage';
import { MasPage } from './features/mas/MasPage';
import { RastreoPage } from './features/rastreo/RastreoPage';
import { IndicadoresPage } from './features/indicadores/IndicadoresPage';
import { DevolucionesPage } from './features/devoluciones/DevolucionesPage';
import { BodegasPage } from './features/bodegas/BodegasPage';
import { DuplicadosPage } from './features/duplicados/DuplicadosPage';

/** El entregador entra directo a su cola de entregas. */
function Inicio() {
  const { usuario } = useAuth();
  if (usuario?.rol === 'ENTREGADOR') return <Navigate to="/entregas" replace />;
  return <DashboardPage />;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<RutaProtegida />}>
            <Route element={<Layout />}>
              {/* Todos los roles */}
              <Route path="/" element={<Inicio />} />
              <Route path="/clientes" element={<ClientesPage />} />
              <Route path="/mapa" element={<MapaPage />} />
              <Route path="/facturas" element={<FacturasPage />} />
              <Route path="/perfil" element={<PerfilPage />} />
              <Route path="/mas" element={<MasPage />} />
            </Route>
          </Route>

          {/* Vender: vendedores y supervisores (los administradores no venden) */}
          <Route element={<RutaProtegida roles={['VENDEDOR', 'SUPERVISOR']} />}>
            <Route element={<Layout />}>
              <Route path="/venta" element={<VentaPage />} />
              <Route path="/mi-inventario" element={<MiInventarioPage />} />
            </Route>
          </Route>

          {/* Entregadores y gestión */}
          <Route element={<RutaProtegida roles={['ENTREGADOR', 'ADMIN', 'COADMIN', 'SUPERVISOR']} />}>
            <Route element={<Layout />}>
              <Route path="/entregas" element={<EntregadorPage />} />
            </Route>
          </Route>

          {/* Solo administración (manejo de inventario, costos y catálogo) */}
          <Route element={<RutaProtegida roles={['ADMIN', 'COADMIN']} />}>
            <Route element={<Layout />}>
              <Route path="/inventario" element={<InventarioPage />} />
              <Route path="/productos" element={<ProductosPage />} />
              <Route path="/proveedores" element={<ProveedoresPage />} />
              <Route path="/importar" element={<ImportarPage />} />
              <Route path="/bodegas" element={<BodegasPage />} />
              <Route path="/duplicados" element={<DuplicadosPage />} />
            </Route>
          </Route>

          {/* Gestión y auditoría: admins y supervisores */}
          <Route element={<RutaProtegida roles={['ADMIN', 'COADMIN', 'SUPERVISOR']} />}>
            <Route element={<Layout />}>
              <Route path="/reportes" element={<ReportesPage />} />
              <Route path="/dashboard-ejecutivo" element={<DashboardEjecutivoPage />} />
              <Route path="/usuarios" element={<UsuariosPage />} />
              <Route path="/rastreo" element={<RastreoPage />} />
            </Route>
          </Route>

          {/* Indicadores: gestión + el vendedor ve los suyos */}
          <Route element={<RutaProtegida roles={['ADMIN', 'COADMIN', 'SUPERVISOR', 'VENDEDOR']} />}>
            <Route element={<Layout />}>
              <Route path="/indicadores" element={<IndicadoresPage />} />
              <Route path="/devoluciones" element={<DevolucionesPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

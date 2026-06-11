import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { RutaProtegida } from './auth/RutaProtegida';
import { Layout } from './components/Layout';
import { LoginPage } from './features/login/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ClientesPage } from './features/clientes/ClientesPage';
import { VentaPage } from './features/venta/VentaPage';
import { ProductosPage } from './features/productos/ProductosPage';
import { InventarioPage } from './features/inventario/InventarioPage';
import { ProveedoresPage } from './features/proveedores/ProveedoresPage';
import { MapaPage } from './features/mapa/MapaPage';
import { EntregadorPage } from './features/entregador/EntregadorPage';
import { ImportarPage } from './features/importar/ImportarPage';
import { ReportesPage } from './features/reportes/ReportesPage';
import { GastosPage } from './features/gastos/GastosPage';
import { UsuariosPage } from './features/usuarios/UsuariosPage';
import { PerfilPage } from './features/perfil/PerfilPage';
import { FacturasPage } from './features/facturas/FacturasPage';
import { MasPage } from './features/mas/MasPage';

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
              <Route path="/productos" element={<ProductosPage />} />
              <Route path="/mapa" element={<MapaPage />} />
              <Route path="/facturas" element={<FacturasPage />} />
              <Route path="/perfil" element={<PerfilPage />} />
              <Route path="/mas" element={<MasPage />} />
            </Route>
          </Route>

          {/* Vendedores y admins */}
          <Route element={<RutaProtegida roles={['VENDEDOR', 'ADMIN', 'COADMIN']} />}>
            <Route element={<Layout />}>
              <Route path="/venta" element={<VentaPage />} />
              <Route path="/gastos" element={<GastosPage />} />
            </Route>
          </Route>

          {/* Entregadores y admins */}
          <Route element={<RutaProtegida roles={['ENTREGADOR', 'ADMIN', 'COADMIN']} />}>
            <Route element={<Layout />}>
              <Route path="/entregas" element={<EntregadorPage />} />
            </Route>
          </Route>

          {/* Solo administración */}
          <Route element={<RutaProtegida roles={['ADMIN', 'COADMIN']} />}>
            <Route element={<Layout />}>
              <Route path="/inventario" element={<InventarioPage />} />
              <Route path="/proveedores" element={<ProveedoresPage />} />
              <Route path="/reportes" element={<ReportesPage />} />
              <Route path="/importar" element={<ImportarPage />} />
              <Route path="/usuarios" element={<UsuariosPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

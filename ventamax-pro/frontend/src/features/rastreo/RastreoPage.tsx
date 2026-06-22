import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { rastreoApi } from '../../api/servicios';
import { MapaRastreo, PALETA } from '../../components/MapaRastreo';
import type { OperacionRecorrido } from '../../api/tipos';

const hoyISO = () => {
  const d = new Date();
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const hora = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—';

export function RastreoPage() {
  const [vendedorId, setVendedorId] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [verRecorrido, setVerRecorrido] = useState(true);
  const [verTodos, setVerTodos] = useState(false);

  const { data: vendedores } = useQuery({ queryKey: ['rastreo-vendedores'], queryFn: rastreoApi.vendedores });
  const { data: vivos } = useQuery({ queryKey: ['rastreo-vivo'], queryFn: rastreoApi.vivo, refetchInterval: 15_000 });

  const { data: recorrido, isFetching } = useQuery({
    queryKey: ['rastreo-recorrido', vendedorId, fecha],
    queryFn: () => rastreoApi.recorrido(vendedorId, fecha),
    enabled: !!vendedorId,
  });
  // Recorridos de TODOS los vendedores (cuando no hay uno seleccionado y la casilla está activa)
  const { data: rutasTodos, isFetching: cargandoTodos } = useQuery({
    queryKey: ['rastreo-recorridos', fecha],
    queryFn: () => rastreoApi.recorridos(fecha),
    enabled: !vendedorId && verTodos,
  });

  const vivosVista = vendedorId ? (vivos ?? []).filter(v => v.id === vendedorId) : (vivos ?? []);
  const res = recorrido?.resumen;
  const mostrarTodos = !vendedorId && verTodos;

  const exportar = () => {
    const filas: any[] = [];
    const push = (vend: string, o: OperacionRecorrido) => filas.push({
      Vendedor: vend, Tipo: o.tipo === 'venta' ? 'Venta' : 'No compró', Hora: hora(o.hora),
      Cliente: o.cliente, Total: o.total ?? '', Referencias: o.refs ?? '', Unidades: o.unidades ?? '',
      Causal: o.causal ?? '', Direccion: o.direccion ?? '', Lat: o.lat, Lng: o.lng,
    });
    if (mostrarTodos) (rutasTodos ?? []).forEach(r => r.operaciones.forEach(o => push(r.nombre, o)));
    else if (vendedorId) {
      const nom = vendedores?.find(v => v.id === vendedorId)?.nombre ?? '';
      (recorrido?.operaciones ?? []).forEach(o => push(nom, o));
    }
    if (!filas.length) { alert('No hay operaciones para exportar en esta fecha.'); return; }
    const hoja = XLSX.utils.json_to_sheet(filas);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Operaciones');
    XLSX.writeFile(libro, `recorrido_${fecha}${vendedorId ? '_' + (vendedores?.find(v => v.id === vendedorId)?.nombre ?? '') : '_todos'}.xlsx`);
  };

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', display: 'grid', gap: 12 }}>
      {/* Controles */}
      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px' }}>
        <select value={vendedorId} onChange={e => setVendedorId(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
          <option value="">Todos en vivo…</option>
          {vendedores?.map(v => <option key={v.id} value={v.id}>{v.nombre}{v.zona ? ` · ${v.zona}` : ''}</option>)}
        </select>
        <input type="date" value={fecha} max={hoyISO()} onChange={e => setFecha(e.target.value)} style={{ minWidth: 150 }} />
        {vendedorId && (
          <button className="btn btn-ghost" style={{ padding: '7px 11px', fontSize: 12 }} onClick={() => setVendedorId('')}>Ver todos</button>
        )}
        <button className="btn btn-ghost" style={{ padding: '7px 11px', fontSize: 12 }} onClick={exportar}>⬇ Exportar</button>

        {vendedorId ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', width: '100%' }}>
            <input type="checkbox" checked={verRecorrido} onChange={e => setVerRecorrido(e.target.checked)} style={{ width: 'auto' }} />
            Ver recorrido (trayecto + operaciones del día)
          </label>
        ) : (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', width: '100%' }}>
            <input type="checkbox" checked={verTodos} onChange={e => setVerTodos(e.target.checked)} style={{ width: 'auto' }} />
            Ver recorridos de TODOS los vendedores (del día) {cargandoTodos && '· cargando…'}
          </label>
        )}
      </div>

      {/* En vivo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
        <span className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>En vivo</span>
        <span className="muted" style={{ fontSize: 11 }}>{vivos?.length ? `${vivos.length} con ubicación` : 'Nadie con GPS activo ahora'}</span>
      </div>

      {/* Leyenda de colores (varios vendedores) */}
      {mostrarTodos && !!rutasTodos?.length && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {rutasTodos.map((r, i) => (
            <span key={r.vendedorId} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <span style={{ width: 12, height: 4, borderRadius: 2, background: PALETA[i % PALETA.length] }} />
              {r.nombre} <span className="muted">({r.operaciones.length})</span>
            </span>
          ))}
        </div>
      )}

      {/* Resumen del recorrido (un vendedor) */}
      {vendedorId && (
        <div className="card" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '12px 14px' }}>
          <Dato etiqueta="Inicio" valor={hora(res?.inicio ?? null)} />
          <Dato etiqueta="Último punto" valor={hora(res?.fin ?? null)} />
          <Dato etiqueta="Puntos" valor={String(res?.puntos ?? 0)} />
          <Dato etiqueta="Distancia" valor={`${res?.distanciaKm ?? 0} km`} />
          <Dato etiqueta="Ventas" valor={String(res?.ventas ?? 0)} />
          <Dato etiqueta="No compró" valor={String(res?.visitas ?? 0)} />
          {isFetching && <span className="muted" style={{ fontSize: 11, alignSelf: 'center' }}>Cargando…</span>}
        </div>
      )}

      <MapaRastreo vivos={vivosVista}
        recorrido={vendedorId && verRecorrido ? recorrido?.puntos : undefined}
        operaciones={vendedorId && verRecorrido ? recorrido?.operaciones : undefined}
        rutas={mostrarTodos ? rutasTodos : undefined}
        alto={480} />

      <p className="muted" style={{ fontSize: 11 }}>
        La ubicación se actualiza mientras el vendedor tiene la app abierta con GPS. El recorrido guarda un punto cada ~30 m.
        Las operaciones (🟢 venta · 🟠 no compró) se ubican donde está el cliente.
      </p>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.5px' }}>{etiqueta}</div>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{valor}</div>
    </div>
  );
}

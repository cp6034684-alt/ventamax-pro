import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { rastreoApi } from '../../api/servicios';
import { MapaRastreo } from '../../components/MapaRastreo';

const hoyISO = () => {
  const d = new Date();
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—';

export function RastreoPage() {
  const [vendedorId, setVendedorId] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [verRecorrido, setVerRecorrido] = useState(true);

  const { data: vendedores } = useQuery({ queryKey: ['rastreo-vendedores'], queryFn: rastreoApi.vendedores });

  // Posiciones en vivo: refresco cada 15s
  const { data: vivos } = useQuery({
    queryKey: ['rastreo-vivo'],
    queryFn: rastreoApi.vivo,
    refetchInterval: 15_000,
  });

  // Recorrido del día del vendedor seleccionado
  const { data: recorrido, isFetching } = useQuery({
    queryKey: ['rastreo-recorrido', vendedorId, fecha],
    queryFn: () => rastreoApi.recorrido(vendedorId, fecha),
    enabled: !!vendedorId,
  });

  // Si hay un vendedor elegido, mostramos solo su marcador vivo (para no saturar)
  const vivosVista = vendedorId ? (vivos ?? []).filter(v => v.id === vendedorId) : (vivos ?? []);
  const res = recorrido?.resumen;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', display: 'grid', gap: 12 }}>
      {/* Controles */}
      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px' }}>
        <select value={vendedorId} onChange={e => setVendedorId(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
          <option value="">Todos en vivo…</option>
          {vendedores?.map(v => <option key={v.id} value={v.id}>{v.nombre}{v.zona ? ` · ${v.zona}` : ''}</option>)}
        </select>
        <input type="date" value={fecha} max={hoyISO()} onChange={e => setFecha(e.target.value)}
          style={{ minWidth: 150 }} disabled={!vendedorId} />
        {vendedorId && (
          <button className="btn btn-ghost" style={{ padding: '7px 11px', fontSize: 12 }}
            onClick={() => setVendedorId('')}>Ver todos</button>
        )}
        {vendedorId && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', width: '100%' }}>
            <input type="checkbox" checked={verRecorrido} onChange={e => setVerRecorrido(e.target.checked)} style={{ width: 'auto' }} />
            Ver recorrido (trayecto + operaciones del día)
          </label>
        )}
      </div>

      {/* En vivo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
        <span className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>
          En vivo
        </span>
        <span className="muted" style={{ fontSize: 11 }}>
          {vivos?.length ? `${vivos.length} con ubicación` : 'Nadie con GPS activo ahora'}
        </span>
      </div>

      {/* Resumen del recorrido */}
      {vendedorId && (
        <div className="card" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '12px 14px' }}>
          <Dato etiqueta="Inicio" valor={hora(res?.inicio ?? null)} />
          <Dato etiqueta="Último punto" valor={hora(res?.fin ?? null)} />
          <Dato etiqueta="Puntos" valor={String(res?.puntos ?? 0)} />
          <Dato etiqueta="Distancia" valor={`${res?.distanciaKm ?? 0} km`} />
          <Dato etiqueta="Ventas" valor={String(res?.ventas ?? 0)} />
          <Dato etiqueta="No compró" valor={String(res?.visitas ?? 0)} />
          {isFetching && <span className="muted" style={{ fontSize: 11, alignSelf: 'center' }}>Cargando…</span>}
          {!isFetching && res && res.puntos === 0 && (
            <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
              Sin recorrido para este día (el vendedor no envió ubicación).
            </span>
          )}
        </div>
      )}

      <MapaRastreo vivos={vivosVista}
        recorrido={vendedorId && verRecorrido ? recorrido?.puntos : undefined}
        operaciones={vendedorId && verRecorrido ? recorrido?.operaciones : undefined}
        alto={480} />

      <p className="muted" style={{ fontSize: 11 }}>
        La ubicación se actualiza mientras el vendedor tiene la app abierta y con GPS permitido.
        El recorrido guarda un punto cada vez que se desplaza ~30 metros.
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

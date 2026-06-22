import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientesApi } from '../../api/servicios';
import { fmtCodigo } from '../../api/formato';
import { useAuth } from '../../auth/AuthContext';
import { Mapa } from '../../components/Mapa';
import { CAUSALES_NO_COMPRA as CAUSALES } from '../../api/causales';
import type { EstadoMapa } from '../../api/tipos';

const DIAS = ['Todos', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const diaHoy = (() => { const d = new Date().getDay(); return d === 0 ? 7 : d; })();

const COLOR: Record<EstadoMapa, string> = { pendiente: '#00c8ff', vendido: '#00e5a0', no_compra: '#ffaa00' };

export function MapaPage() {
  const { usuario } = useAuth();
  const esVendedor = usuario?.rol === 'VENDEDOR';
  // Roles que venden en campo (ven los botones Vender / No compró en el mapa).
  const puedeVender = usuario?.rol === 'VENDEDOR' || usuario?.rol === 'SUPERVISOR';
  const navegar = useNavigate();

  const [dia, setDia] = useState(esVendedor ? diaHoy : 0);
  const [selId, setSelId] = useState<string | null>(null);
  const [causales, setCausales] = useState(false);
  // Filtro de visita (excluyente): 'todos' | 'sinVisitar' | 'visitados'
  const [filtro, setFiltro] = useState<'todos' | 'sinVisitar' | 'visitados'>('todos');
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['mapa', dia],
    queryFn: () => clientesApi.mapa(dia || undefined),
  });

  const noCompra = useMutation({
    mutationFn: ({ id, causal }: { id: string; causal: string }) => clientesApi.noCompra(id, causal),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mapa'] }); setCausales(false); setSelId(null); },
  });

  const clientes = data ?? [];
  const visitado = (e: string) => e === 'vendido' || e === 'no_compra';
  const clientesVista = clientes.filter(c =>
    filtro === 'sinVisitar' ? c.estado === 'pendiente'
    : filtro === 'visitados' ? visitado(c.estado)
    : true);
  const sel = clientes.find(c => c.id === selId);
  const pendientes = clientes.filter(c => c.estado === 'pendiente').length;
  const vendidos = clientes.filter(c => c.estado === 'vendido').length;
  const noCompraron = clientes.filter(c => c.estado === 'no_compra').length;

  const mapsUrl = sel && (sel.lat && sel.lng
    ? `https://www.google.com/maps/search/?api=1&query=${sel.lat},${sel.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([sel?.direccion, sel?.barrio, sel?.ciudad].filter(Boolean).join(' '))}`);
  const tel = (sel?.telefono ?? '').replace(/\D/g, '');
  const waUrl = `https://wa.me/${tel.length === 10 ? '57' + tel : tel}`;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gap: 12 }}>
      {/* Filtro por día */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {DIAS.map((d, i) => (
          <button key={i} className={`btn ${dia === i ? '' : 'btn-ghost'}`}
            style={{ fontSize: 11, padding: '6px 12px', whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={() => { setDia(i); setSelId(null); }}>
            {d}{i === diaHoy ? ' (hoy)' : ''}
          </button>
        ))}
      </div>

      {/* Casillas excluyentes: filtrar por visita (respetan los colores) */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={filtro === 'sinVisitar'} style={{ width: 'auto' }}
            onChange={e => setFiltro(e.target.checked ? 'sinVisitar' : 'todos')} />
          Solo sin visitar
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={filtro === 'visitados'} style={{ width: 'auto' }}
            onChange={e => setFiltro(e.target.checked ? 'visitados' : 'todos')} />
          Solo visitados (venta + no compró)
        </label>
        {filtro !== 'todos' && <span className="muted">Mostrando {clientesVista.length} de {clientes.length}</span>}
      </div>

      <div style={{ position: 'relative' }}>
        <Mapa
          puntos={clientesVista.map(c => ({ id: c.id, lat: c.lat, lng: c.lng, titulo: c.nombre, color: COLOR[c.estado] }))}
          onSeleccionar={id => { setSelId(id); setCausales(false); }}
        />

        {/* Panel del cliente seleccionado — flota SOBRE el mapa */}
        {sel && (
          <div style={{
            position: 'absolute', left: 10, right: 10, bottom: 10, zIndex: 1100,
            maxWidth: 460, margin: '0 auto',
            background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)',
            padding: 14, boxShadow: '0 10px 30px rgba(0,0,0,.55)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR[sel.estado], flexShrink: 0 }} />
              <strong style={{ fontSize: 15, flex: 1 }}>{sel.nombre}</strong>
              {sel.codigo != null && <span className="mono accent" style={{ fontSize: 12 }}>{fmtCodigo(sel.codigo)}</span>}
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              📍 {[sel.direccion, sel.barrio, sel.ciudad].filter(Boolean).join(' · ') || 'Sin dirección'}
              {sel.estado === 'vendido' && <div style={{ color: 'var(--green)', fontWeight: 700, marginTop: 4 }}>✓ Vendido hoy</div>}
              {sel.estado === 'no_compra' && <div style={{ color: 'var(--orange)', fontWeight: 700, marginTop: 4 }}>Visitado · no compró</div>}
            </div>

            {!causales ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <a className="btn" style={{ textAlign: 'center', textDecoration: 'none', background: 'linear-gradient(135deg, var(--orange), #cc7a00)' }}
                    href={mapsUrl!} target="_blank" rel="noreferrer">🗺 Llegar</a>
                  <a className="btn" style={{ textAlign: 'center', textDecoration: 'none', background: 'linear-gradient(135deg, #25D366, #128C7E)', pointerEvents: tel ? 'auto' : 'none', opacity: tel ? 1 : .5 }}
                    href={tel ? waUrl : undefined} target="_blank" rel="noreferrer">💬 WhatsApp</a>
                  {puedeVender && <button className="btn" onClick={() => navegar('/venta', { state: { cliente: sel } })}>🛒 Vender</button>}
                  {puedeVender && sel.estado === 'pendiente' && (
                    <button className="btn" style={{ background: 'linear-gradient(135deg, var(--orange), #cc7a00)' }} onClick={() => setCausales(true)}>🚫 No compró</button>
                  )}
                </div>
                <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setSelId(null)}>Cerrar</button>
              </>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>¿Por qué no compró?</div>
                {CAUSALES.map(c => (
                  <button key={c} className="btn btn-ghost" style={{ textAlign: 'left', fontSize: 13 }}
                    disabled={noCompra.isPending}
                    onClick={() => noCompra.mutate({ id: sel.id, causal: c })}>{c}</button>
                ))}
                <button className="btn btn-ghost" style={{ marginTop: 4 }} onClick={() => setCausales(false)}>← Volver</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Leyenda + conteos */}
      <div className="muted" style={{ fontSize: 12, textAlign: 'center', display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
        <span><span style={{ color: COLOR.pendiente }}>●</span> Pendientes: <b>{pendientes}</b></span>
        <span><span style={{ color: COLOR.vendido }}>●</span> Vendidos: <b>{vendidos}</b></span>
        <span><span style={{ color: COLOR.no_compra }}>●</span> No compraron: <b>{noCompraron}</b></span>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientesApi } from '../../api/servicios';
import { fmtMoneda, fmtFecha, fmtCodigo } from '../../api/formato';
import { COLOR_ESTADO } from '../../api/formato';
import { CAUSALES_NO_COMPRA } from '../../api/causales';
import { useAuth } from '../../auth/AuthContext';
import type { Cliente } from '../../api/tipos';

const DIAS = ['—', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Etiqueta amable de la tipología (define la lista de precio del cliente).
const TIPOLOGIA_LABEL: Record<string, string> = {
  TAT: 'TAT (tienda)', DROGUERIAS: 'Droguería', MAYORISTA: 'Mayorista',
  GENERAL: 'General', TAT_VIAJEROS: 'TAT Viajeros', ENTRE_SEDE: 'Entre Sede',
};

function iniciales(n: string) {
  return n.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor?: string | null }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.5px' }}>{etiqueta}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{valor || '—'}</div>
    </div>
  );
}

function Stat({ valor, label, color }: { valor: string; label: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 11, padding: '9px 6px', textAlign: 'center' }}>
      <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: color ?? 'var(--text)' }}>{valor}</div>
      <div className="muted" style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '.5px', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function ClienteDetalle({ cliente, onCerrar, onEditar, onVender }: {
  cliente: Cliente; onCerrar: () => void; onEditar: (c: Cliente) => void; onVender?: (c: Cliente) => void;
}) {
  const navegar = useNavigate();
  const { usuario } = useAuth();
  const esVendedor = usuario?.rol === 'VENDEDOR';
  const [tab, setTab] = useState<'info' | 'pedidos' | 'categorias'>('info');
  const [causales, setCausales] = useState(false);
  const [noComproHecho, setNoComproHecho] = useState(false);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['cliente-detalle', cliente.id], queryFn: () => clientesApi.detalle(cliente.id) });

  const noCompra = useMutation({
    mutationFn: (causal: string) => clientesApi.noCompra(cliente.id, causal),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['ruta'] });
      setCausales(false); setNoComproHecho(true);
    },
  });

  const c = data ?? (cliente as any);
  const s = data?.stats;
  // El "tipo de cliente" del archivo del negocio se importó en segmento (TIENDA, DROGUERIA…);
  // la tipología (lista de precio) puede no estar fijada aún. Mostramos lo que exista.
  const tipoCliente: string | null = c.tipologia || c.segmento || null;

  // Categorías a partir de las últimas facturas
  const cats = new Map<string, number>();
  data?.facturas?.forEach(f => f.items?.forEach(it => {
    const cat = it.producto && (it.producto as any).categoria;
    if (cat) cats.set(cat, (cats.get(cat) ?? 0) + it.cantidad);
  }));

  const mapsUrl = c.lat && c.lng
    ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.direccion, c.barrio, c.ciudad].filter(Boolean).join(' '))}`;

  // WhatsApp: número en formato internacional (Colombia = 57 + 10 dígitos)
  const soloDigitos = (c.telefono ?? '').replace(/\D/g, '');
  const waNumero = soloDigitos.length === 10 ? '57' + soloDigitos : soloDigitos;
  const waUrl = `https://wa.me/${waNumero}?text=${encodeURIComponent(`Hola ${c.contacto || c.nombre}, le saluda su distribuidora. `)}`;

  return (
    <div onClick={onCerrar} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 50,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--card)', borderTopLeftRadius: 20, borderTopRightRadius: 20,
        width: '100%', maxWidth: 460, maxHeight: '92vh', overflowY: 'auto',
        border: '1px solid var(--border)', padding: 18,
      }}>
        {/* Cabecera */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <span style={{
            width: 54, height: 54, borderRadius: '50%', background: 'rgba(0,200,255,.15)', color: 'var(--accent)',
            fontSize: 18, fontWeight: 800, display: 'grid', placeItems: 'center',
          }}>{iniciales(c.nombre)}</span>
          <strong style={{ fontSize: 16, textAlign: 'center' }}>{c.nombre}</strong>
          <span className="muted" style={{ fontSize: 11 }}>
            {[c.codigo != null ? fmtCodigo(c.codigo) : 's/código', c.barrio, c.ciudad].filter(Boolean).join(' · ')}
          </span>
        </div>

        {/* Estadísticas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 14 }}>
          <Stat valor={fmtMoneda(s?.total ?? 0)} label="Total" color="var(--green)" />
          <Stat valor={String(s?.unidades ?? 0)} label="Unidades" />
          <Stat valor={fmtMoneda(s?.ticketPromedio ?? 0)} label="Ticket prom." />
          <Stat valor={String(s?.pedidos ?? 0)} label="Pedidos" color="var(--accent)" />
          <Stat valor={String(s?.hoy ?? 0)} label="Hoy" />
          <Stat valor={String(s?.categorias ?? 0)} label="Categorías" color="var(--purple)" />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {([['info', 'ℹ️ Info'], ['pedidos', '🧾 Pedidos'], ['categorias', '📦 Categorías']] as const).map(([k, etq]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, padding: '7px 4px', fontSize: 11, fontWeight: 700, borderRadius: 9, cursor: 'pointer',
              border: tab === k ? 'none' : '1px solid var(--border)',
              background: tab === k ? 'linear-gradient(135deg, var(--accent), #0044ff)' : 'var(--bg3)',
              color: tab === k ? '#fff' : 'var(--muted)',
            }}>{etq}</button>
          ))}
        </div>

        {/* Contenido tabs */}
        {tab === 'info' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Dato etiqueta="Contacto" valor={c.contacto} />
              <Dato etiqueta="NIT/CC" valor={c.nit} />
              <Dato etiqueta="Teléfono" valor={c.telefono} />
              <Dato etiqueta="Correo" valor={c.correo} />
              <Dato etiqueta="Ciudad" valor={c.ciudad} />
              <Dato etiqueta="Barrio" valor={c.barrio} />
              <Dato etiqueta="Dirección" valor={c.direccion} />
              <Dato etiqueta="Zona" valor={c.zona} />
              <Dato etiqueta="Tipología" valor={tipoCliente ? (TIPOLOGIA_LABEL[tipoCliente] ?? tipoCliente) : null} />
              <Dato etiqueta="Saldo pendiente" valor={Number(c.saldoPendiente) > 0 ? fmtMoneda(c.saldoPendiente) : 'Al día'} />
            </div>
            {!c.correo && (
              <div style={{ background: 'rgba(255,170,0,.1)', border: '1px solid rgba(255,170,0,.3)', borderRadius: 9, padding: '8px 10px', fontSize: 11, color: 'var(--orange)' }}>
                ✉ Falta el correo para factura electrónica (DIAN). Tócalo en Editar para agregarlo.
              </div>
            )}
            {!c.lat && (
              <div style={{ background: 'rgba(255,64,96,.1)', border: '1px solid rgba(255,64,96,.3)', borderRadius: 9, padding: '8px 10px', fontSize: 11, color: 'var(--red)' }}>
                📍 Falta la ubicación GPS — es clave para la ruta. Estando en la tienda, tócala en Editar → "Capturar ubicación GPS".
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 11, padding: '9px 12px' }}>
              <div>
                <div className="muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.5px' }}>📅 Día de ruta</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{c.diaVisita ? DIAS[c.diaVisita] : 'Sin asignar'}</div>
              </div>
              <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 11 }} onClick={() => onEditar(c)}>Cambiar</button>
            </div>
          </div>
        )}

        {tab === 'pedidos' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {!data?.facturas?.length && <p className="muted" style={{ fontSize: 13, textAlign: 'center', padding: 16 }}>Sin pedidos registrados.</p>}
            {data?.facturas?.map(f => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 11px' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>#{f.consecutivo}</div>
                  <div className="muted" style={{ fontSize: 10 }}>{fmtFecha(f.creadoEn)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{fmtMoneda(f.total)}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: COLOR_ESTADO[f.estado] ?? 'var(--muted)' }}>{f.estado}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'categorias' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {!cats.size && <p className="muted" style={{ fontSize: 13, textAlign: 'center', padding: 16 }}>Sin compras recientes por categoría.</p>}
            {[...cats.entries()].sort((a, b) => b[1] - a[1]).map(([cat, cant]) => (
              <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 11px', fontSize: 12 }}>
                <span>{cat}</span><span className="mono accent">{cant} u.</span>
              </div>
            ))}
          </div>
        )}

        {/* Acciones — mismo juego de colores del original */}
        {causales ? (
          <div style={{ display: 'grid', gap: 6, marginTop: 14 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>¿Por qué no compró?</div>
            {CAUSALES_NO_COMPRA.map(motivo => (
              <button key={motivo} className="btn btn-ghost" style={{ textAlign: 'left', fontSize: 13 }}
                disabled={noCompra.isPending} onClick={() => noCompra.mutate(motivo)}>{motivo}</button>
            ))}
            <button className="btn btn-ghost" style={{ marginTop: 4 }} onClick={() => setCausales(false)}>← Volver</button>
          </div>
        ) : noComproHecho ? (
          <div style={{ marginTop: 14 }}>
            <div className="card" style={{ borderColor: 'var(--orange)', color: 'var(--orange)', textAlign: 'center', fontSize: 13 }}>
              ✓ Registrado: el cliente no compró (queda fuera de pendientes hoy).
            </div>
            <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={onCerrar}>Cerrar</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
              <a className="btn btn-ghost" style={{ textAlign: 'center', textDecoration: 'none', pointerEvents: c.telefono ? 'auto' : 'none', opacity: c.telefono ? 1 : .5 }}
                href={c.telefono ? `tel:${c.telefono}` : undefined}>📞 Llamar</a>
              <a className="btn" style={{ textAlign: 'center', textDecoration: 'none', background: 'linear-gradient(135deg, #25D366, #128C7E)', pointerEvents: c.telefono ? 'auto' : 'none', opacity: c.telefono ? 1 : .5 }}
                href={c.telefono ? waUrl : undefined} target="_blank" rel="noreferrer">💬 WhatsApp</a>
              <a className="btn" style={{ textAlign: 'center', textDecoration: 'none', background: 'linear-gradient(135deg, var(--orange), #cc7a00)' }}
                href={mapsUrl} target="_blank" rel="noreferrer">🗺 Cómo llegar</a>
              {esVendedor && <button className="btn" onClick={() => (onVender ? onVender(c) : navegar('/venta'))}>🛒 Vender</button>}
            </div>
            {esVendedor && (
              <button className="btn" style={{ width: '100%', marginTop: 8, background: 'linear-gradient(135deg, var(--orange), #cc7a00)' }}
                onClick={() => setCausales(true)}>🚫 No compró</button>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <button className="btn" style={{ background: 'linear-gradient(135deg, var(--green), #00a070)' }} onClick={() => onEditar(c)}>📍 Editar / GPS</button>
              <button className="btn btn-ghost" onClick={onCerrar}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

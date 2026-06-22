import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientesApi } from '../../api/servicios';
import { fmtMoneda, fmtCodigo } from '../../api/formato';
import { useAuth } from '../../auth/AuthContext';
import { ClienteDetalle } from './ClienteDetalle';
import type { Cliente } from '../../api/tipos';

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS_CORTO = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Tipología del cliente: define la lista de precio con la que se le vende.
const TIPOLOGIAS: [string, string][] = [
  ['TAT', 'TAT (tienda)'],
  ['DROGUERIAS', 'Droguería'],
  ['MAYORISTA', 'Mayorista'],
  ['GENERAL', 'General'],
  ['TAT_VIAJEROS', 'TAT Viajeros'],
  ['ENTRE_SEDE', 'Entre Sede'],
];

function iniciales(nombre: string) {
  return nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 20, cursor: 'pointer',
      whiteSpace: 'nowrap', flexShrink: 0,
      border: activo ? 'none' : '1px solid var(--border)',
      background: activo ? 'linear-gradient(135deg, var(--accent), #0044ff)' : 'var(--bg3)',
      color: activo ? '#fff' : 'var(--muted)',
    }}>{children}</button>
  );
}

export function ClientesPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN' || usuario?.rol === 'COADMIN';
  // Supervisor y administradores pueden cambiar tipología, nombre y documento (NIT).
  const puedeIdentidad = esAdmin || usuario?.rol === 'SUPERVISOR';
  const navegar = useNavigate();

  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [dia, setDia] = useState<number | undefined>(undefined);
  const [barrio, setBarrio] = useState<string | undefined>(undefined);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [detalle, setDetalle] = useState<Cliente | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [capturando, setCapturando] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['clientes', busqueda, pagina, dia, barrio],
    queryFn: () => clientesApi.listar(busqueda, pagina, 50, { dia, barrio }),
  });
  const { data: barrios } = useQuery({ queryKey: ['barrios'], queryFn: () => clientesApi.barrios() });

  const cerrarForm = () => { setMostrarForm(false); setEditando(null); setCoords(null); };
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['clientes'] });
    qc.invalidateQueries({ queryKey: ['barrios'] });
    cerrarForm();
  };
  const crear = useMutation({ mutationFn: clientesApi.crear, onSuccess: invalidar });
  const actualizar = useMutation({
    mutationFn: ({ id, ...d }: any) => clientesApi.actualizar(id, d), onSuccess: invalidar,
  });

  const capturarGPS = () => {
    if (!navigator.geolocation) return alert('Este dispositivo no soporta GPS');
    setCapturando(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setCapturando(false); },
      () => { alert('No se pudo obtener la ubicación. Activa el GPS y los permisos.'); setCapturando(false); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const guardar = (ed: Cliente | null) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const datos: any = {
      nombre: String(fd.get('nombre')),
      contacto: String(fd.get('contacto') || '') || undefined,
      telefono: String(fd.get('telefono') || '') || undefined,
      direccion: String(fd.get('direccion') || '') || undefined,
      barrio: String(fd.get('barrio') || '') || undefined,
      ciudad: String(fd.get('ciudad') || '') || undefined,
      correo: String(fd.get('correo') || '') || undefined,
      nit: String(fd.get('nit') || '') || undefined,
      razonSocial: String(fd.get('razonSocial') || '') || undefined,
      diaVisita: Number(fd.get('diaVisita')) || undefined,
    };
    const tip = String(fd.get('tipologia') || '');
    if (tip) { datos.tipologia = tip; datos.listaPrecio = tip; }
    if (coords) { datos.lat = coords.lat; datos.lng = coords.lng; }
    ed ? actualizar.mutate({ id: ed.id, ...datos }) : crear.mutate(datos);
  };

  // Bloqueo de identidad: al EDITAR, el vendedor no cambia nombre/documento/tipología.
  const bloqueoId = (ed: Cliente | null) => !!ed && !puedeIdentidad;
  const roSty = (ro: boolean): React.CSSProperties | undefined => ro ? { opacity: .55, cursor: 'not-allowed' } : undefined;

  // ── Formulario (nuevo o editar) ──
  const formulario = (ed: Cliente | null) => {
    const bloq = bloqueoId(ed);
    return (
      <form key={ed?.id ?? 'nuevo'} className="card" style={{ display: 'grid', gap: 10 }} onSubmit={guardar(ed)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 13 }}>{ed ? `Editar: ${ed.nombre}` : 'Nuevo cliente'}</strong>
          {ed?.codigo != null && <span className="mono accent" style={{ fontSize: 12, fontWeight: 700 }}>{fmtCodigo(ed.codigo)}</span>}
        </div>
        {!ed && <p className="muted" style={{ fontSize: 11 }}>El código (VMX-####) se genera automáticamente al guardar.</p>}
        {bloq && <p className="muted" style={{ fontSize: 11 }}>El nombre, el documento y la tipología solo los puede cambiar un supervisor o administrador.</p>}

        <input name="nombre" placeholder="Nombre del negocio *" defaultValue={ed?.nombre} required
          readOnly={bloq} style={roSty(bloq)} />
        <input name="contacto" placeholder="Nombre del tendero" defaultValue={ed?.contacto} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input name="razonSocial" placeholder="Razón social (nombre legal)" defaultValue={ed?.razonSocial ?? ''} />
          <input name="nit" placeholder="NIT / Cédula" defaultValue={ed?.nit ?? ''} readOnly={bloq} style={roSty(bloq)} />
        </div>
        {puedeIdentidad ? (
          <select name="tipologia" defaultValue={ed?.tipologia ?? ''}>
            <option value="">Tipología (define la lista de precio)…</option>
            {TIPOLOGIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ) : (
          <div style={{ fontSize: 12, padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--muted)' }}>
            Tipología: <b style={{ color: 'var(--text)' }}>{TIPOLOGIAS.find(([v]) => v === ed?.tipologia)?.[1] ?? 'sin asignar'}</b>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input name="telefono" placeholder="Teléfono" defaultValue={ed?.telefono} inputMode="tel" />
          <select name="diaVisita" defaultValue={ed?.diaVisita ?? ''}>
            <option value="">Día de visita</option>
            {DIAS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
          </select>
        </div>
        <input name="direccion" placeholder="Dirección" defaultValue={ed?.direccion} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input name="barrio" placeholder="Barrio" defaultValue={ed?.barrio} />
          <input name="ciudad" placeholder="Ciudad" defaultValue={ed?.ciudad} />
        </div>
        <input name="correo" type="email" placeholder="Correo electrónico (para factura electrónica DIAN)" defaultValue={ed?.correo} />
        <button type="button" className="btn btn-ghost" onClick={capturarGPS} disabled={capturando}>
          {capturando ? 'Obteniendo ubicación…'
            : coords ? `📍 Ubicación capturada (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`
            : ed?.lat ? '📍 Tiene ubicación — tocar para actualizar con mi GPS'
            : '📍 Capturar ubicación GPS (estando en la tienda)'}
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ flex: 1 }}>{ed ? 'Actualizar' : 'Guardar cliente'}</button>
          <button type="button" className="btn btn-ghost" onClick={cerrarForm}>Cancelar</button>
        </div>
        {(crear.isError || actualizar.isError) && (
          <div className="error-box">{((crear.error ?? actualizar.error) as Error).message}</div>
        )}
      </form>
    );
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'grid', gap: 12 }}>
      {/* ── Encabezado ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 16 }}>Clientes</strong>
        <span className="mono" style={{
          fontSize: 11, fontWeight: 700, background: 'var(--bg3)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '1px 8px', color: 'var(--accent)',
        }}>{data?.paginacion.total ?? 0}</span>
        <div style={{ flex: 1 }} />
        {esAdmin && (
          <button className="btn" style={{ padding: '7px 11px', fontSize: 12, background: 'linear-gradient(135deg, var(--orange), #cc7a00)' }}
            onClick={() => navegar('/importar')}>📥 Importar XLS</button>
        )}
        <button className="btn" style={{ padding: '7px 11px', fontSize: 12 }}
          onClick={() => { setEditando(null); setCoords(null); setMostrarForm(v => !v); }}>＋ Nuevo</button>
      </div>

      {/* ── Buscador ── */}
      <input placeholder="Buscar por código, nombre, NIT/documento, barrio, ciudad, teléfono…" value={busqueda}
        onChange={e => { setBusqueda(e.target.value); setPagina(1); }} />

      {/* ── Chips por día ── */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        <Chip activo={dia === undefined} onClick={() => { setDia(undefined); setPagina(1); }}>Todos los días</Chip>
        {DIAS_CORTO.slice(1).map((d, i) => (
          <Chip key={d} activo={dia === i + 1} onClick={() => { setDia(i + 1); setPagina(1); }}>{d}</Chip>
        ))}
      </div>

      {/* ── Chips por barrio ── */}
      {!!barrios?.length && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          <Chip activo={!barrio} onClick={() => { setBarrio(undefined); setPagina(1); }}>Todos los barrios</Chip>
          {barrios.slice(0, 30).map(b => (
            <Chip key={b.barrio} activo={barrio === b.barrio} onClick={() => { setBarrio(b.barrio); setPagina(1); }}>
              {b.barrio} <span style={{ opacity: .7 }}>({b.total})</span>
            </Chip>
          ))}
        </div>
      )}

      {/* ── Formulario NUEVO (arriba) ── */}
      {mostrarForm && !editando && formulario(null)}

      {/* ── Lista ── */}
      {isLoading && <p className="muted">Cargando…</p>}
      {!isLoading && !data?.datos.length && (
        <div className="card" style={{ textAlign: 'center', padding: 28, color: 'var(--muted)', fontSize: 13 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
          No hay clientes con este filtro.
          {esAdmin && <><br /><span style={{ fontSize: 12 }}>Usa <b>📥 Importar XLS</b> para cargar tu base de clientes.</span></>}
        </div>
      )}
      {data?.datos.map(c => {
        const loc = [c.barrio, c.ciudad, c.direccion].filter(Boolean).join(' · ');
        return (
          <div key={c.id} style={{ display: 'grid', gap: 8 }}>
            <div className="card" onClick={() => setDetalle(c)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderLeft: '3px solid var(--accent)', cursor: 'pointer' }}>
              <span style={{
                width: 34, height: 34, borderRadius: 9, background: 'rgba(0,200,255,.12)', color: 'var(--accent)',
                fontSize: 12, fontWeight: 800, display: 'grid', placeItems: 'center', flexShrink: 0,
              }}>{iniciales(c.nombre)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>{c.nombre} {c.lat ? '📍' : ''}</strong>
                <div className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {loc || 'Sin dirección'}
                </div>
                <div style={{ fontSize: 11, marginTop: 1, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {c.contacto && <span className="muted">{c.contacto}</span>}
                  {c.codigo != null
                    ? <span className="mono accent">{fmtCodigo(c.codigo)}</span>
                    : <span className="muted" style={{ fontStyle: 'italic' }}>s/código</span>}
                  {c.diaVisita ? <span className="muted">{DIAS_CORTO[c.diaVisita]}</span> : null}
                  {c.correo
                    ? <span className="muted" title={c.correo}>✉</span>
                    : <span style={{ color: 'var(--orange)' }} title="Falta correo para factura electrónica">✉ falta correo</span>}
                  {!c.lat && <span style={{ color: 'var(--red)', fontWeight: 700 }} title="Falta ubicación GPS">📍 falta GPS</span>}
                </div>
                {Number(c.saldoPendiente) > 0 && (
                  <div style={{ color: 'var(--orange)', fontSize: 11, marginTop: 2 }}>Debe: {fmtMoneda(c.saldoPendiente)}</div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, color: 'var(--green)', background: 'rgba(0,229,160,.12)',
                  border: '1px solid rgba(0,229,160,.3)', borderRadius: 6, padding: '1px 7px',
                }}>activo</span>
                <button className="btn btn-ghost" style={{ padding: '5px 9px', fontSize: 12 }}
                  onClick={e => { e.stopPropagation(); setCoords(null); setMostrarForm(false); setDetalle(null); setEditando(editando?.id === c.id ? null : c); }}>
                  {editando?.id === c.id ? '✖' : '✏️'}
                </button>
              </div>
            </div>
            {/* Formulario de edición INLINE, justo debajo del cliente */}
            {editando?.id === c.id && formulario(c)}
          </div>
        );
      })}

      {/* ── Paginación ── */}
      {data && data.paginacion.totalPaginas > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
          <button className="btn btn-ghost" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>←</button>
          <span className="muted" style={{ fontSize: 12 }}>
            {pagina} / {data.paginacion.totalPaginas} ({data.paginacion.total} clientes)
          </span>
          <button className="btn btn-ghost" disabled={pagina >= data.paginacion.totalPaginas} onClick={() => setPagina(p => p + 1)}>→</button>
        </div>
      )}

      {/* ── Modal de detalle ── */}
      {detalle && (
        <ClienteDetalle
          cliente={detalle}
          onCerrar={() => setDetalle(null)}
          onEditar={c => { setDetalle(null); setCoords(null); setMostrarForm(false); setEditando(c); }}
          onVender={c => { setDetalle(null); navegar('/venta', { state: { cliente: c } }); }}
        />
      )}
    </div>
  );
}

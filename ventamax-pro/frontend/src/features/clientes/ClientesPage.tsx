import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientesApi } from '../../api/servicios';
import { fmtMoneda } from '../../api/formato';
import type { Cliente } from '../../api/tipos';

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function ClientesPage() {
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [capturando, setCapturando] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['clientes', busqueda, pagina],
    queryFn: () => clientesApi.listar(busqueda, pagina),
  });

  const cerrarForm = () => { setMostrarForm(false); setEditando(null); setCoords(null); };
  const invalidar = () => { qc.invalidateQueries({ queryKey: ['clientes'] }); cerrarForm(); };
  const crear = useMutation({ mutationFn: clientesApi.crear, onSuccess: invalidar });
  const actualizar = useMutation({
    mutationFn: ({ id, ...d }: any) => clientesApi.actualizar(id, d), onSuccess: invalidar,
  });

  // Captura la posición GPS del teléfono — clave para el mapa de rutas TAT
  const capturarGPS = () => {
    if (!navigator.geolocation) return alert('Este dispositivo no soporta GPS');
    setCapturando(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setCapturando(false); },
      () => { alert('No se pudo obtener la ubicación. Activa el GPS y los permisos.'); setCapturando(false); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const guardar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const datos: any = {
      nombre: String(fd.get('nombre')),
      contacto: String(fd.get('contacto') || '') || undefined,
      telefono: String(fd.get('telefono') || '') || undefined,
      direccion: String(fd.get('direccion') || '') || undefined,
      barrio: String(fd.get('barrio') || '') || undefined,
      diaVisita: Number(fd.get('diaVisita')) || undefined,
    };
    if (coords) { datos.lat = coords.lat; datos.lng = coords.lng; }
    editando ? actualizar.mutate({ id: editando.id, ...datos }) : crear.mutate(datos);
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="Buscar por nombre o barrio…" value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setPagina(1); }} />
        <button className="btn" onClick={() => { editando ? cerrarForm() : setMostrarForm(v => !v); }}>＋</button>
      </div>

      {(mostrarForm || editando) && (
        <form key={editando?.id ?? 'nuevo'} className="card" style={{ display: 'grid', gap: 10 }} onSubmit={guardar}>
          <strong style={{ fontSize: 13 }}>{editando ? `Editar: ${editando.nombre}` : 'Nuevo cliente'}</strong>
          <input name="nombre" placeholder="Nombre del negocio *" defaultValue={editando?.nombre} required />
          <input name="contacto" placeholder="Nombre del tendero" defaultValue={editando?.contacto} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input name="telefono" placeholder="Teléfono" defaultValue={editando?.telefono} inputMode="tel" />
            <select name="diaVisita" defaultValue={editando?.diaVisita ?? ''}>
              <option value="">Día de visita</option>
              {DIAS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </select>
          </div>
          <input name="direccion" placeholder="Dirección" defaultValue={editando?.direccion} />
          <input name="barrio" placeholder="Barrio" defaultValue={editando?.barrio} />
          <button type="button" className="btn btn-ghost" onClick={capturarGPS} disabled={capturando}>
            {capturando ? 'Obteniendo ubicación…'
              : coords ? `📍 Ubicación capturada (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`
              : editando?.lat ? '📍 Tiene ubicación — tocar para actualizar con mi GPS'
              : '📍 Capturar ubicación GPS (estando en la tienda)'}
          </button>
          <button className="btn">{editando ? 'Actualizar cliente' : 'Guardar cliente'}</button>
          {(crear.isError || actualizar.isError) && (
            <div className="error-box">{((crear.error ?? actualizar.error) as Error).message}</div>
          )}
        </form>
      )}

      {isLoading && <p className="muted">Cargando…</p>}
      {data?.datos.map(c => (
        <div key={c.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px' }}>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 14 }}>{c.nombre} {c.lat ? '📍' : ''}</strong>
            <div className="muted" style={{ fontSize: 12 }}>
              {[c.barrio, c.telefono, c.diaVisita ? DIAS[c.diaVisita] : null].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
            </div>
            {Number(c.saldoPendiente) > 0 && (
              <div style={{ color: 'var(--orange)', fontSize: 12, marginTop: 2 }}>
                Debe: {fmtMoneda(c.saldoPendiente)}
              </div>
            )}
          </div>
          <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => { setCoords(null); setEditando(c); }}>✏️</button>
        </div>
      ))}

      {data && data.paginacion.totalPaginas > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
          <button className="btn btn-ghost" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>←</button>
          <span className="muted" style={{ fontSize: 12 }}>
            {pagina} / {data.paginacion.totalPaginas} ({data.paginacion.total} clientes)
          </span>
          <button className="btn btn-ghost" disabled={pagina >= data.paginacion.totalPaginas} onClick={() => setPagina(p => p + 1)}>→</button>
        </div>
      )}
    </div>
  );
}

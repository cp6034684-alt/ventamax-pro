import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clientesApi, productosApi, facturasApi, reportesApi } from '../../api/servicios';
import { encolarVenta } from '../../api/colaOffline';
import { fmtMoneda, fmtCodigo } from '../../api/formato';
import { precioLista, LISTA_LABEL } from '../../api/listas';
import { Recibo } from '../../components/Recibo';
import { ClienteDetalle } from '../clientes/ClienteDetalle';
import type { Producto, Factura, Cliente } from '../../api/tipos';

interface ItemCarrito { producto: Producto; cantidad: number; }

const DIAS_CORTO = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const diaHoy = (() => { const d = new Date().getDay(); return d === 0 ? 7 : d; })();
const hoyTexto = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

function iniciales(n: string) {
  return n.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
      border: activo ? 'none' : '1px solid var(--border)',
      background: activo ? 'linear-gradient(135deg, var(--accent), #0044ff)' : 'var(--bg3)',
      color: activo ? '#fff' : 'var(--muted)',
    }}>{children}</button>
  );
}

export function VentaPage() {
  const navegar = useNavigate();
  const loc = useLocation();
  // La lista de precio la define el CLIENTE (según su tipología), no el vendedor.
  const [lista, setLista] = useState<string>('TAT');
  // Vista: lista de ruta o formulario de venta
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [detalle, setDetalle] = useState<Cliente | null>(null);
  const [tab, setTab] = useState<'hoy' | 'semana' | 'buscar'>('hoy');
  const [diaSel, setDiaSel] = useState(diaHoy);
  const [barrio, setBarrio] = useState<string | undefined>(undefined);
  const [busquedaRuta, setBusquedaRuta] = useState('');
  const [pagina, setPagina] = useState(1);

  // Carrito
  const [busqueda, setBusqueda] = useState('');
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [descuento, setDescuento] = useState(0);
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error' | 'offline'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [recibo, setRecibo] = useState<Factura | null>(null);
  const [notas, setNotas] = useState('');
  const qc = useQueryClient();

  const dia = tab === 'hoy' ? diaHoy : tab === 'semana' ? diaSel : undefined;

  const { data: ruta, isLoading } = useQuery({
    queryKey: ['ruta', tab, dia, barrio, busquedaRuta, pagina],
    queryFn: () => clientesApi.listar(busquedaRuta, pagina, 50, { dia, barrio }),
  });
  const { data: barrios } = useQuery({ queryKey: ['barrios-ruta', dia], queryFn: () => clientesApi.barrios(dia) });
  const { data: miDia } = useQuery({ queryKey: ['mi-dia'], queryFn: reportesApi.miDia });
  const { data: rutaHoyTot } = useQuery({
    queryKey: ['ruta-hoy-total'], queryFn: () => clientesApi.listar('', 1, 1, { dia: diaHoy }),
  });

  const totalHoy = rutaHoyTot?.paginacion.total ?? 0;
  const listos = miDia?.ventasHoy ?? 0;

  const abrirVenta = (c: Cliente) => {
    setCliente(c); setCarrito([]); setDescuento(0); setMetodoPago('EFECTIVO'); setMensaje(null); setBusqueda(''); setNotas('');
  };

  // Si llegamos con un cliente preseleccionado (desde el mapa o el detalle), abrir su venta directo
  useEffect(() => {
    const c = (loc.state as any)?.cliente;
    if (c) abrirVenta(c as Cliente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Carrito ──
  const agregar = (p: Producto) => setCarrito(c => {
    const e = c.find(i => i.producto.id === p.id);
    return e ? c.map(i => i.producto.id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i) : [...c, { producto: p, cantidad: 1 }];
  });
  const cambiarCantidad = (id: string, d: number) =>
    setCarrito(c => c.map(i => i.producto.id === id ? { ...i, cantidad: i.cantidad + d } : i).filter(i => i.cantidad > 0));

  const subtotal = carrito.reduce((s, i) => s + precioLista(i.producto, lista) * i.cantidad, 0);
  const total = Math.max(0, subtotal - descuento);
  const iva = Math.round(total * 19 / 119); // IVA contenido en el precio (precio con IVA incluido)

  const { data: productos } = useQuery({ queryKey: ['productos', busqueda], queryFn: () => productosApi.listar(busqueda), enabled: !!cliente });
  const { data: detalleCli } = useQuery({ queryKey: ['venta-detalle', cliente?.id], queryFn: () => clientesApi.detalle(cliente!.id), enabled: !!cliente });

  // La lista de precio la define el cliente (según su tipología).
  useEffect(() => {
    const l = (detalleCli as any)?.listaPrecio ?? (cliente as any)?.listaPrecio;
    setLista(l || 'TAT');
  }, [cliente, detalleCli]);

  const registrar = async () => {
    if (!cliente) return;
    if (!carrito.length) return setMensaje({ tipo: 'error', texto: 'Agrega al menos un producto' });
    const venta = {
      clienteId: cliente.id,
      idLocal: crypto.randomUUID(),
      descuento, metodoPago,
      listaPrecio: lista,
      notas: notas.trim() || undefined,
      items: carrito.map(i => ({ productoId: i.producto.id, cantidad: i.cantidad })),
    };
    setEnviando(true); setMensaje(null);
    try {
      const f = await facturasApi.crear(venta);
      setMensaje({ tipo: 'ok', texto: `Venta #${f.consecutivo} registrada — ${fmtMoneda(f.total)}` });
      setRecibo({ ...f, cliente: { nombre: cliente.nombre, telefono: cliente.telefono } });
      setCarrito([]); setDescuento(0);
      qc.invalidateQueries({ queryKey: ['mi-dia'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
    } catch (e: any) {
      if (!navigator.onLine || /fetch|network/i.test(e.message)) {
        encolarVenta(venta, { cliente: cliente.nombre, unidades: carrito.reduce((s, i) => s + i.cantidad, 0), total, fecha: Date.now() });
        setMensaje({ tipo: 'offline', texto: 'Sin conexión. La venta se guardó y aparecerá en el aviso "pedidos sin subir" hasta que se sincronice.' });
        setCarrito([]); setDescuento(0);
      } else {
        setMensaje({ tipo: 'error', texto: e.message });
      }
    } finally { setEnviando(false); }
  };

  // ──────────────────────────────────────────────────────────
  // VISTA B — FORMULARIO DE VENTA
  // ──────────────────────────────────────────────────────────
  if (cliente) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', display: 'grid', gap: 12 }}>
        <button className="btn btn-ghost" onClick={() => setCliente(null)}>← Volver a la ruta</button>

        <div className="card" style={{ display: 'flex', gap: 10, borderLeft: '3px solid var(--accent)' }}>
          <span style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(0,200,255,.12)', color: 'var(--accent)', fontSize: 14, fontWeight: 800, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{iniciales(cliente.nombre)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ fontSize: 14 }}>{cliente.nombre}</strong>
            <div className="muted" style={{ fontSize: 11, marginTop: 1 }}>
              📍 {[cliente.direccion, cliente.barrio, cliente.ciudad].filter(Boolean).join(' · ') || 'Sin dirección'}
            </div>
            <div className="muted" style={{ fontSize: 11, display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
              {cliente.telefono && <span>📞 {cliente.telefono}</span>}
              {cliente.nit && <span>NIT: {cliente.nit}</span>}
              {cliente.codigo != null && <span className="mono accent">{fmtCodigo(cliente.codigo)}</span>}
              {cliente.diaVisita ? <span>📅 {DIAS[cliente.diaVisita]}</span> : null}
            </div>
          </div>
        </div>

        <div className="muted" style={{ fontSize: 11 }}>
          Lista de precio del cliente: <b>{(LISTA_LABEL as any)[lista] ?? lista}</b>
        </div>

        <input placeholder="Buscar producto…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {productos?.datos.map(p => (
            <button key={p.id} className="card" onClick={() => agregar(p)} style={{ textAlign: 'left', padding: 10, color: 'var(--text)' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{p.nombre}</div>
              <div className="mono accent" style={{ fontSize: 13 }}>{fmtMoneda(precioLista(p, lista))}</div>
              <div style={{ fontSize: 11, color: p.stock <= 0 ? 'var(--red)' : 'var(--muted)' }}>Stock: {p.stock}</div>
            </button>
          ))}
        </div>

        {carrito.length > 0 && (
          <div className="card" style={{ position: 'sticky', bottom: 0 }}>
            {carrito.map(i => (
              <div key={i.producto.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13 }}>
                <span style={{ flex: 1 }}>{i.producto.nombre}</span>
                <button className="btn btn-ghost" style={{ padding: '2px 10px' }} onClick={() => cambiarCantidad(i.producto.id, -1)}>−</button>
                <span className="mono">{i.cantidad}</span>
                <button className="btn btn-ghost" style={{ padding: '2px 10px' }} onClick={() => cambiarCantidad(i.producto.id, 1)}>＋</button>
                <span className="mono" style={{ width: 80, textAlign: 'right' }}>{fmtMoneda(precioLista(i.producto, lista) * i.cantidad)}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0', paddingTop: 8, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                <span>Subtotal</span><span className="mono">{fmtMoneda(subtotal)}</span>
              </div>
              {descuento > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--orange)' }}>
                  <span>Descuento</span><span className="mono">− {fmtMoneda(descuento)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                <span>IVA 19% (incluido)</span><span className="mono">{fmtMoneda(iva)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, margin: '6px 0' }}>
              <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} style={{ flex: 1 }}>
                <option value="EFECTIVO">💵 Efectivo</option>
                <option value="TRANSFERENCIA">📲 Transferencia</option>
                <option value="CREDITO">📒 Crédito (fiado)</option>
              </select>
              <input type="number" placeholder="Descuento" value={descuento || ''} min={0} max={subtotal}
                onChange={e => setDescuento(Number(e.target.value) || 0)} style={{ width: 120 }} inputMode="numeric" />
            </div>
            <input placeholder="💬 Observación (opcional) — ej: entregar en la tarde" value={notas}
              onChange={e => setNotas(e.target.value)} style={{ marginBottom: 8, fontSize: 12 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, padding: '4px 0 10px' }}>
              <span>TOTAL{metodoPago === 'CREDITO' ? ' (a crédito)' : ''}</span>
              <span className="mono green" style={{ fontSize: 18 }}>{fmtMoneda(total)}</span>
            </div>
            <button className="btn" style={{ width: '100%', background: 'linear-gradient(135deg, var(--green), #00a070)' }} onClick={registrar} disabled={enviando}>
              {enviando ? 'Registrando…' : '✓ Confirmar y facturar'}
            </button>
          </div>
        )}

        {mensaje && (
          <div className={mensaje.tipo === 'error' ? 'error-box' : 'card'}
            style={mensaje.tipo !== 'error' ? { borderColor: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--orange)', color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--orange)', fontSize: 13, textAlign: 'center' } : undefined}>
            {mensaje.texto}
            {mensaje.tipo === 'ok' && <div style={{ marginTop: 8 }}><button className="btn btn-ghost" onClick={() => setCliente(null)}>← Volver a la ruta</button></div>}
          </div>
        )}

        {/* Historial del cliente */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 10px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span className="muted" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase' }}>📊 Historial del cliente</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          {!detalleCli?.stats?.pedidos ? (
            <div className="card" style={{ textAlign: 'center', padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', marginBottom: 4 }}>🆕 PRIMER PEDIDO DE ESTE CLIENTE</div>
              <div className="muted" style={{ fontSize: 11 }}>Después de la primera compra verás aquí sus estadísticas e historial.</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                {[
                  { v: fmtMoneda(detalleCli.stats.total), l: 'Total', c: 'var(--green)' },
                  { v: String(detalleCli.stats.pedidos), l: 'Pedidos', c: 'var(--accent)' },
                  { v: fmtMoneda(detalleCli.stats.ticketPromedio), l: 'Ticket prom.', c: 'var(--purple)' },
                ].map(s => (
                  <div key={s.l} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: s.c }}>{s.v}</div>
                    <div className="muted" style={{ fontSize: 8, textTransform: 'uppercase' }}>{s.l}</div>
                  </div>
                ))}
              </div>
              {detalleCli.facturas.slice(0, 4).map(f => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className="muted">#{f.consecutivo} · {new Date(f.creadoEn).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</span>
                  <span className="mono">{fmtMoneda(f.total)}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {recibo && <Recibo factura={recibo} onCerrar={() => setRecibo(null)} />}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────
  // VISTA A — RUTA DEL DÍA
  // ──────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'grid', gap: 12 }}>
      {/* Resumen del día */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(0,200,255,.08), rgba(0,229,160,.05))' }}>
        <div style={{ display: 'inline-block', background: 'var(--bg3)', borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700, marginBottom: 10, textTransform: 'capitalize' }}>📅 {hoyTexto}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, textAlign: 'center' }}>
          {[
            { v: String(totalHoy), l: 'Hoy', c: 'var(--accent)' },
            { v: String(listos), l: 'Listos', c: 'var(--green)' },
            { v: String(Math.max(0, totalHoy - listos)), l: 'Pendientes', c: 'var(--orange)' },
            { v: fmtMoneda(miDia?.totalHoy ?? 0), l: 'Vendido', c: 'var(--purple)' },
          ].map(s => (
            <div key={s.l}>
              <div className="mono" style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
              <div className="muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.5px' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {([['hoy', '📅 Ruta de hoy'], ['semana', '📆 Semana'], ['buscar', '🔍 Buscar']] as const).map(([k, etq]) => (
          <button key={k} onClick={() => { setTab(k); setBarrio(undefined); setBusquedaRuta(''); setPagina(1); }} style={{
            flex: 1, padding: '9px 4px', fontSize: 12, fontWeight: 700, borderRadius: 10, cursor: 'pointer',
            border: tab === k ? 'none' : '1px solid var(--border)',
            background: tab === k ? 'linear-gradient(135deg, var(--accent), #0044ff)' : 'var(--bg3)',
            color: tab === k ? '#fff' : 'var(--muted)',
          }}>{etq}</button>
        ))}
      </div>

      {/* Selector de día (solo en Semana) */}
      {tab === 'semana' && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          {DIAS_CORTO.slice(1).map((d, i) => (
            <Chip key={d} activo={diaSel === i + 1} onClick={() => { setDiaSel(i + 1); setPagina(1); }}>{d}</Chip>
          ))}
        </div>
      )}

      {/* Búsqueda */}
      <input placeholder={tab === 'buscar' ? 'Buscar cliente (nombre, barrio, NIT, teléfono)…' : 'Buscar en esta ruta (nombre, barrio…)…'}
        value={busquedaRuta} onChange={e => { setBusquedaRuta(e.target.value); setPagina(1); }} />

      {/* Chips por barrio */}
      {!!barrios?.length && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          <Chip activo={!barrio} onClick={() => { setBarrio(undefined); setPagina(1); }}>Todos</Chip>
          {barrios.slice(0, 30).map(b => (
            <Chip key={b.barrio} activo={barrio === b.barrio} onClick={() => { setBarrio(b.barrio); setPagina(1); }}>
              {b.barrio} <span style={{ opacity: .7 }}>({b.total})</span>
            </Chip>
          ))}
        </div>
      )}

      {/* Lista de clientes de la ruta */}
      {isLoading && <p className="muted">Cargando…</p>}
      {!isLoading && !ruta?.datos.length && (
        <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 13 }}>
          {tab === 'hoy' ? 'No hay clientes asignados para hoy. Usa "Semana" o "Buscar".' : 'Sin clientes con este filtro.'}
        </div>
      )}
      {ruta?.datos.map((c, i) => {
        const loc = [c.barrio, c.ciudad, c.direccion].filter(Boolean).join(' · ');
        return (
          <div key={c.id} className="card" onClick={() => setDetalle(c)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', cursor: 'pointer' }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--bg3)', color: 'var(--muted)', fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{(pagina - 1) * 50 + i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 13 }}>{c.nombre} {c.lat ? '📍' : ''}</strong>
              <div className="muted" style={{ fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc || 'Sin dirección'}</div>
              <div style={{ fontSize: 10, marginTop: 1, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {c.contacto && <span className="muted">{c.contacto}</span>}
                {c.codigo != null && <span className="mono accent">{fmtCodigo(c.codigo)}</span>}
                {!c.lat && <span style={{ color: 'var(--red)', fontWeight: 700 }}>Sin GPS</span>}
              </div>
            </div>
            <button className="btn" style={{ padding: '8px 14px', fontSize: 12, background: 'linear-gradient(135deg, var(--green), #00a070)' }}
              onClick={e => { e.stopPropagation(); abrirVenta(c); }}>Vender</button>
          </div>
        );
      })}

      {/* Paginación */}
      {ruta && ruta.paginacion.totalPaginas > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
          <button className="btn btn-ghost" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>←</button>
          <span className="muted" style={{ fontSize: 12 }}>{pagina} / {ruta.paginacion.totalPaginas} ({ruta.paginacion.total})</span>
          <button className="btn btn-ghost" disabled={pagina >= ruta.paginacion.totalPaginas} onClick={() => setPagina(p => p + 1)}>→</button>
        </div>
      )}

      {/* Tarjeta de detalle (misma que en Clientes) */}
      {detalle && (
        <ClienteDetalle
          cliente={detalle}
          onCerrar={() => setDetalle(null)}
          onEditar={() => navegar('/clientes')}
          onVender={c => { setDetalle(null); abrirVenta(c); }}
        />
      )}
    </div>
  );
}

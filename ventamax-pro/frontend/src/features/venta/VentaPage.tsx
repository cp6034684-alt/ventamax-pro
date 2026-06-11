import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clientesApi, productosApi, facturasApi } from '../../api/servicios';
import { encolarVenta } from '../../api/colaOffline';
import { fmtMoneda } from '../../api/formato';
import { Recibo } from '../../components/Recibo';
import type { Producto, Factura } from '../../api/tipos';

interface ItemCarrito { producto: Producto; cantidad: number; }

export function VentaPage() {
  const [clienteId, setClienteId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [descuento, setDescuento] = useState(0);
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error' | 'offline'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [recibo, setRecibo] = useState<Factura | null>(null);
  const qc = useQueryClient();

  const { data: clientes } = useQuery({ queryKey: ['clientes-venta'], queryFn: () => clientesApi.listar('', 1, 500) });
  const { data: productos } = useQuery({ queryKey: ['productos', busqueda], queryFn: () => productosApi.listar(busqueda) });

  const agregar = (p: Producto) => {
    setCarrito(c => {
      const existe = c.find(i => i.producto.id === p.id);
      return existe
        ? c.map(i => i.producto.id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i)
        : [...c, { producto: p, cantidad: 1 }];
    });
  };

  const cambiarCantidad = (id: string, delta: number) => {
    setCarrito(c => c
      .map(i => i.producto.id === id ? { ...i, cantidad: i.cantidad + delta } : i)
      .filter(i => i.cantidad > 0));
  };

  const subtotal = carrito.reduce((s, i) => s + Number(i.producto.precioVenta) * i.cantidad, 0);
  const total = Math.max(0, subtotal - descuento);

  const registrar = async () => {
    if (!clienteId) return setMensaje({ tipo: 'error', texto: 'Selecciona el cliente' });
    if (!carrito.length) return setMensaje({ tipo: 'error', texto: 'Agrega al menos un producto' });

    const venta = {
      clienteId,
      idLocal: crypto.randomUUID(), // idempotencia: el backend no duplicará reintentos
      descuento,
      metodoPago,
      items: carrito.map(i => ({ productoId: i.producto.id, cantidad: i.cantidad })),
    };

    setEnviando(true); setMensaje(null);
    try {
      const f = await facturasApi.crear(venta);
      setMensaje({ tipo: 'ok', texto: `Venta #${f.consecutivo} registrada — ${fmtMoneda(f.total)}` });
      // Completar nombre del cliente para el recibo
      const cliente = clientes?.datos.find(c => c.id === clienteId);
      setRecibo({ ...f, cliente: { nombre: cliente?.nombre ?? '', telefono: cliente?.telefono } });
      setCarrito([]); setDescuento(0);
      qc.invalidateQueries({ queryKey: ['mi-dia'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
    } catch (e: any) {
      if (!navigator.onLine || /fetch|network/i.test(e.message)) {
        // Sin señal: la venta queda en cola y se sube al volver la conexión.
        encolarVenta(venta);
        setMensaje({ tipo: 'offline', texto: 'Sin conexión. La venta se guardó y se enviará automáticamente.' });
        setCarrito([]); setDescuento(0);
      } else {
        setMensaje({ tipo: 'error', texto: e.message });
      }
    } finally { setEnviando(false); }
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'grid', gap: 12 }}>
      <select value={clienteId} onChange={e => setClienteId(e.target.value)}>
        <option value="">— Selecciona el cliente —</option>
        {clientes?.datos.map(c => (
          <option key={c.id} value={c.id}>{c.nombre}{c.barrio ? ` (${c.barrio})` : ''}</option>
        ))}
      </select>

      <input placeholder="Buscar producto…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {productos?.datos.map(p => (
          <button key={p.id} className="card" onClick={() => agregar(p)}
            style={{ textAlign: 'left', padding: 10, color: 'var(--text)' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{p.nombre}</div>
            <div className="mono accent" style={{ fontSize: 13 }}>{fmtMoneda(p.precioVenta)}</div>
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
              <span className="mono" style={{ width: 80, textAlign: 'right' }}>
                {fmtMoneda(Number(i.producto.precioVenta) * i.cantidad)}
              </span>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
            <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} style={{ flex: 1 }}>
              <option value="EFECTIVO">💵 Efectivo</option>
              <option value="TRANSFERENCIA">📲 Transferencia</option>
              <option value="CREDITO">📒 Crédito (fiado)</option>
            </select>
            <input type="number" placeholder="Descuento" value={descuento || ''} min={0} max={subtotal}
              onChange={e => setDescuento(Number(e.target.value) || 0)} style={{ width: 120 }} inputMode="numeric" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, padding: '4px 0 10px' }}>
            <span>TOTAL{metodoPago === 'CREDITO' ? ' (a crédito)' : ''}</span>
            <span className="mono green">{fmtMoneda(total)}</span>
          </div>
          <button className="btn" style={{ width: '100%' }} onClick={registrar} disabled={enviando}>
            {enviando ? 'Registrando…' : 'Registrar venta'}
          </button>
        </div>
      )}

      {mensaje && (
        <div className={mensaje.tipo === 'error' ? 'error-box' : 'card'}
          style={mensaje.tipo !== 'error' ? {
            borderColor: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--orange)',
            color: mensaje.tipo === 'ok' ? 'var(--green)' : 'var(--orange)',
            fontSize: 13, textAlign: 'center',
          } : undefined}>
          {mensaje.texto}
        </div>
      )}

      {recibo && <Recibo factura={recibo} onCerrar={() => setRecibo(null)} />}
    </div>
  );
}

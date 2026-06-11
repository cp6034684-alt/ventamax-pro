import type { Factura } from '../api/tipos';
import { fmtMoneda, fmtFecha } from '../api/formato';

/**
 * Modal de recibo: imprimir (el navegador permite "Guardar como PDF")
 * o compartir por WhatsApp con el detalle en texto.
 */
export function Recibo({ factura, onCerrar }: { factura: Factura; onCerrar: () => void }) {
  const textoWA = () => {
    const lineas = factura.items.map(i =>
      `• ${i.producto?.nombre ?? 'Producto'} x${i.cantidad} = ${fmtMoneda(i.total)}`).join('\n');
    return encodeURIComponent(
      `*VentaMax Pro — Factura #${factura.consecutivo}*\n` +
      `Cliente: ${factura.cliente?.nombre ?? ''}\n${lineas}\n` +
      `*TOTAL: ${fmtMoneda(factura.total)}*`,
    );
  };
  const tel = factura.cliente?.telefono?.replace(/\D/g, '');

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 100,
      display: 'grid', placeItems: 'center', padding: 16,
    }} onClick={onCerrar}>
      <div className="card recibo-imprimible" style={{ width: '100%', maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, textAlign: 'center' }}>Factura #{factura.consecutivo}</h2>
        <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginBottom: 12 }}>
          {fmtFecha(factura.creadoEn)} · {factura.cliente?.nombre}
        </p>
        {factura.items.map((i, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
            <span>{i.producto?.nombre} × {i.cantidad}</span>
            <span className="mono">{fmtMoneda(i.total)}</span>
          </div>
        ))}
        {Number(factura.descuento) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0' }}>
            <span>Descuento</span><span className="mono">−{fmtMoneda(factura.descuento)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, padding: '12px 0' }}>
          <span>TOTAL</span><span className="mono green">{fmtMoneda(factura.total)}</span>
        </div>
        <div className="no-imprimir" style={{ display: 'grid', gap: 8 }}>
          <button className="btn" onClick={() => window.print()}>🖨 Imprimir / PDF</button>
          {tel && (
            <a className="btn" style={{ textAlign: 'center', textDecoration: 'none', background: 'var(--green)', color: '#04221a' }}
              href={`https://wa.me/57${tel}?text=${textoWA()}`} target="_blank" rel="noreferrer">
              📱 Enviar por WhatsApp
            </a>
          )}
          <button className="btn btn-ghost" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

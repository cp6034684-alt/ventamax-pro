import type { Factura } from '../api/tipos';
import { fmtMoneda } from '../api/formato';

// ── Datos de la empresa ───────────────────────────────────────
// El NIT, dirección y teléfono se completan cuando el negocio los
// entregue; mientras estén vacíos, no aparecen en el recibo.
const EMPRESA = {
  nombre: 'SANTANA DEL EJE',
  nit: '',        // p. ej. '901234567-8'
  dir: '',        // dirección
  tel: '',        // teléfono / WhatsApp del negocio
};

const LABEL_METODO: Record<string, string> = {
  EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', CREDITO: 'Credito',
};

// Construye el texto del RECIBO DE PEDIDO (ticket térmico 58mm, ancho 32).
// Es el MISMO contenido que se imprime y que se envía por WhatsApp.
function textoRecibo(f: Factura): string {
  const W = 32;
  const cen = (s: string) => {
    s = String(s).substring(0, W);
    return ' '.repeat(Math.max(0, Math.floor((W - s.length) / 2))) + s;
  };
  const der = (a: string, b: string) => {
    const sp = Math.max(1, W - String(a).length - String(b).length);
    return String(a) + ' '.repeat(sp) + String(b);
  };
  const num = (n: number | string) => fmtMoneda(n).replace('$', '').trim();
  const linea = '================================';
  const guion = '--------------------------------';
  const fecha = new Date(f.creadoEn);

  let t = '';
  t += linea + '\n';
  t += cen(EMPRESA.nombre) + '\n';
  if (EMPRESA.nit) t += cen('NIT: ' + EMPRESA.nit) + '\n';
  if (EMPRESA.dir) t += cen(EMPRESA.dir) + '\n';
  if (EMPRESA.tel) t += cen('Tel: ' + EMPRESA.tel) + '\n';
  t += linea + '\n';
  t += cen('RECIBO DE PEDIDO') + '\n';
  t += cen('No es factura de venta') + '\n';
  t += linea + '\n';
  t += der('Recibo:', 'FAC-' + String(f.consecutivo).padStart(4, '0')) + '\n';
  t += der('Fecha:', fecha.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })) + '\n';
  t += der('Hora:', fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })) + '\n';
  if (f.metodoPago) t += der('Pago:', LABEL_METODO[f.metodoPago] ?? f.metodoPago) + '\n';
  t += guion + '\n';
  t += 'CLIENTE:\n';
  t += (f.cliente?.nombre ?? '—').substring(0, W) + '\n';
  if (f.cliente?.telefono) t += 'Tel: ' + f.cliente.telefono + '\n';
  const dir = [f.cliente?.direccion, f.cliente?.barrio].filter(Boolean).join(', ');
  if (dir) t += dir.substring(0, W) + '\n';
  t += guion + '\n';
  f.items.forEach(i => {
    const qty = Math.abs(i.cantidad);
    const nombre = (i.producto?.nombre ?? 'Producto').substring(0, 22);
    t += der(qty + 'x ' + nombre, num(i.total)) + '\n';
    t += '  @ ' + num(i.precioUnit) + ' c/u\n';
  });
  t += guion + '\n';
  const refs = f.items.length;
  const unds = f.items.reduce((s, i) => s + Math.abs(i.cantidad), 0);
  t += der('Referencias:', String(refs)) + '\n';
  t += der('Unidades:', String(unds)) + '\n';
  t += guion + '\n';
  if (Number(f.descuento) > 0) {
    t += der('Subtotal:', num(f.subtotal)) + '\n';
    t += der('Descuento:', '-' + num(f.descuento)) + '\n';
    t += guion + '\n';
  }
  t += cen('*** TOTAL ***') + '\n';
  t += cen(fmtMoneda(f.total)) + '\n\n';
  if (f.vendedor?.nombre) t += cen('Vendedor: ' + f.vendedor.nombre) + '\n';
  t += linea + '\n';
  t += cen('La facturacion se realiza') + '\n';
  t += cen('posteriormente.') + '\n';
  t += cen('!Gracias por su pedido!') + '\n';
  t += cen(EMPRESA.nombre) + '\n';
  t += linea + '\n';
  return t;
}

/**
 * Recibo de pedido (no es factura): se imprime (58mm / "Guardar como PDF")
 * o se comparte por WhatsApp — ambos con el mismo contenido.
 */
export function Recibo({ factura, onCerrar }: { factura: Factura; onCerrar: () => void }) {
  const ticket = textoRecibo(factura);
  const tel = factura.cliente?.telefono?.replace(/\D/g, '');

  const imprimir = () => {
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) { alert('Permite las ventanas emergentes para imprimir.'); return; }
    const html = ticket.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    win.document.write(
      '<!DOCTYPE html><html><head><title>Recibo ' + factura.consecutivo + '</title>' +
      '<style>@page{size:58mm auto;margin:0}*{margin:0;padding:0;box-sizing:border-box}' +
      'body{width:58mm;font-family:"Courier New",monospace;font-size:10pt;background:white;color:black;padding:4px;}' +
      'pre{white-space:pre-wrap;font-family:"Courier New",monospace;font-size:10pt;}' +
      '@media print{button{display:none!important}}</style></head><body>' +
      '<button onclick="window.print()" style="width:100%;margin-bottom:8px;padding:8px;font-size:14px;cursor:pointer;">Imprimir / PDF</button>' +
      '<pre>' + html + '</pre></body></html>',
    );
    win.document.close();
    setTimeout(() => win.print(), 600);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 110,
      display: 'grid', placeItems: 'center', padding: 16,
    }} onClick={onCerrar}>
      <div className="card" style={{ width: '100%', maxWidth: 360, display: 'grid', gap: 10 }} onClick={e => e.stopPropagation()}>
        <pre style={{
          whiteSpace: 'pre-wrap', fontFamily: '"Courier New", monospace', fontSize: 11.5,
          lineHeight: 1.35, background: '#fff', color: '#000', borderRadius: 8,
          padding: '12px 10px', margin: 0, maxHeight: '55vh', overflow: 'auto',
        }}>{ticket}</pre>
        <button className="btn" onClick={imprimir}>Imprimir / PDF</button>
        {tel && (
          <a className="btn" style={{ textAlign: 'center', textDecoration: 'none', background: 'var(--green)', color: '#04221a' }}
            href={`https://wa.me/57${tel}?text=${encodeURIComponent(ticket)}`} target="_blank" rel="noreferrer">
            Enviar por WhatsApp
          </a>
        )}
        <button className="btn btn-ghost" onClick={onCerrar}>Cerrar</button>
      </div>
    </div>
  );
}

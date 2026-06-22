import type { Factura } from '../api/tipos';
import { fmtMoneda } from '../api/formato';

// ── Datos de la empresa ───────────────────────────────────────
const EMPRESA = {
  nombre: 'SANTANA DEL EJE',
  nit: '901754060-6',
  dir: '',
  tel: '',
};

const LABEL_METODO: Record<string, string> = {
  EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', CREDITO: 'Crédito',
};

const esc = (s: any) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Número entero a letras (pesos colombianos)
function enLetras(n: number): string {
  n = Math.round(n);
  if (n === 0) return 'cero pesos';
  const UNI = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
    'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte'];
  const DEC = ['', '', 'veinti', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const CEN = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
  const dec = (x: number): string => {
    if (x <= 20) return UNI[x];
    if (x < 30) return 'veinti' + UNI[x - 20];
    const d = Math.floor(x / 10), u = x % 10;
    return DEC[d] + (u ? ' y ' + UNI[u] : '');
  };
  const cen = (x: number): string => {
    if (x === 100) return 'cien';
    const c = Math.floor(x / 100), r = x % 100;
    return (c ? CEN[c] + (r ? ' ' : '') : '') + (r ? dec(r) : '');
  };
  const miles = (x: number): string => {
    if (x < 1000) return cen(x);
    const m = Math.floor(x / 1000), r = x % 1000;
    return (m === 1 ? 'mil' : cen(m) + ' mil') + (r ? ' ' + cen(r) : '');
  };
  const millones = (x: number): string => {
    if (x < 1_000_000) return miles(x);
    const M = Math.floor(x / 1_000_000), r = x % 1_000_000;
    return (M === 1 ? 'un millón' : miles(M) + ' millones') + (r ? ' ' + miles(r) : '');
  };
  return millones(n) + ' pesos';
}

// Desglose de IVA (los precios YA incluyen IVA)
function desgloseIva(f: Factura) {
  const sub = Number(f.subtotal) || 0;
  const tot = Number(f.total) || 0;
  const factor = sub > 0 ? tot / sub : 1;
  let iva = 0;
  f.items.forEach(i => {
    const pct = Number((i.producto as any)?.iva ?? 0);
    const it = Number(i.total) || 0;
    if (pct > 0) iva += it - it / (1 + pct / 100);
  });
  iva = Math.round(iva * factor);
  return { iva, base: tot - iva, total: tot };
}

// ── HTML del recordatorio (impresión / PDF / vista) ───────────
function htmlRecordatorio(f: Factura): string {
  const fecha = new Date(f.creadoEn);
  const fechaTxt = fecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) +
    ' ' + fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const no = 'FAC-' + String(f.consecutivo).padStart(4, '0');
  const c = f.cliente;
  const v = f.vendedor as any;
  const { iva, base, total } = desgloseIva(f);

  const filas = f.items.map(i => {
    const pct = Number((i.producto as any)?.iva ?? 0);
    const qty = Math.abs(i.cantidad);
    return `<tr>
      <td>${esc(i.producto?.nombre ?? 'Producto')}</td>
      <td class="c">${qty}</td>
      <td class="r">${esc(fmtMoneda(i.precioUnit))}</td>
      <td class="c">${pct}%</td>
      <td class="r">${esc(fmtMoneda(i.total))}</td>
    </tr>`;
  }).join('');

  const cliDir = [c?.direccion, c?.barrio].filter(Boolean).join('  ·  ');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Recordatorio ${no}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
  body{background:#fff;color:#1f2937;font-size:13px}
  .doc{max-width:720px;margin:0 auto;padding:0}
  .hdr{background:#1f3550;color:#fff;display:flex;justify-content:space-between;align-items:flex-start;padding:16px 20px}
  .hdr .emp{font-size:20px;font-weight:800;letter-spacing:.5px}
  .hdr .sub{font-size:11px;color:#b9c4d4;margin-top:6px;line-height:1.5}
  .hdr .right{text-align:right}
  .hdr .right .t{font-size:10px;color:#b9c4d4;letter-spacing:1px}
  .hdr .right .no{font-size:22px;font-weight:800;margin-top:2px}
  .hdr .right .nota{font-size:10px;color:#b9c4d4;margin-top:4px}
  .meta{display:flex;justify-content:space-between;background:#f3f4f6;padding:8px 20px;font-size:12px;border-bottom:1px solid #e5e7eb}
  .meta b{color:#1f3550}
  .parts{display:flex;gap:16px;padding:14px 20px}
  .parts .box{flex:1}
  .parts .lbl{font-size:10px;color:#6b7280;letter-spacing:1px;border-bottom:1px solid #e5e7eb;padding-bottom:3px;margin-bottom:5px}
  .parts .nom{font-weight:700;color:#1f3550;font-size:13px}
  .parts .li{font-size:11.5px;color:#374151;line-height:1.55}
  table{width:100%;border-collapse:collapse;margin-top:4px}
  thead th{background:#1f3550;color:#fff;font-size:10.5px;letter-spacing:.5px;padding:7px 10px;text-align:left}
  thead th.c{text-align:center}thead th.r{text-align:right}
  tbody td{padding:8px 10px;border-bottom:1px solid #eef0f3;font-size:12px}
  td.c{text-align:center}td.r{text-align:right}
  .tot{display:flex;justify-content:flex-end;padding:6px 20px}
  .tot table{width:auto;min-width:280px}
  .tot td{padding:3px 0;font-size:12.5px}
  .tot td.k{color:#6b7280;padding-right:24px}
  .tot td.v{text-align:right;font-weight:600}
  .grand{display:flex;justify-content:space-between;align-items:baseline;padding:10px 20px;border-top:2px solid #1f3550;margin-top:4px}
  .grand .g1{font-size:18px;font-weight:800;color:#1f3550}
  .grand .g2{font-size:20px;font-weight:800;color:#1f3550}
  .letras{padding:0 20px 4px;font-size:11px;color:#6b7280;font-style:italic}
  .foot{padding:14px 20px;color:#6b7280;font-size:11px;border-top:1px solid #e5e7eb;margin-top:8px;line-height:1.5}
  @media print{button{display:none!important}}
</style></head><body>
<div class="doc">
  <div class="hdr">
    <div>
      <div class="emp">${esc(EMPRESA.nombre)}</div>
      <div class="sub">NIT. ${esc(EMPRESA.nit)}<br>Colombia${EMPRESA.tel ? '<br>Tel: ' + esc(EMPRESA.tel) : ''}</div>
    </div>
    <div class="right">
      <div class="t">RECORDATORIO</div>
      <div class="no">${no}</div>
      <div class="nota">No es factura de venta</div>
    </div>
  </div>
  <div class="meta">
    <div>Fecha emisión: <b>${esc(fechaTxt)}</b></div>
    <div>Forma de pago: <b>${esc(f.metodoPago ? (LABEL_METODO[f.metodoPago] ?? f.metodoPago) : '—')}</b></div>
  </div>
  <div class="parts">
    <div class="box">
      <div class="lbl">CLIENTE</div>
      <div class="nom">${esc(c?.nombre ?? '—')}</div>
      <div class="li">${c?.nit ? 'NIT/CC: ' + esc(c.nit) + '<br>' : ''}${esc(cliDir)}${c?.ciudad ? '<br>' + esc(c.ciudad) : ''}${c?.telefono ? '<br>Tel: ' + esc(c.telefono) : ''}</div>
    </div>
    <div class="box">
      <div class="lbl">VENDEDOR / ASESOR</div>
      <div class="nom">${esc(v?.nombre ?? '—')}</div>
      <div class="li">${v?.telefono ? 'Tel: ' + esc(v.telefono) + '<br>' : ''}${v?.zona ? 'Zona: ' + esc(v.zona) : ''}</div>
    </div>
  </div>
  <table>
    <thead><tr>
      <th>DESCRIPCIÓN</th><th class="c">CANT.</th><th class="r">V. UNIT.</th><th class="c">IVA</th><th class="r">SUBTOTAL</th>
    </tr></thead>
    <tbody>${filas}</tbody>
  </table>
  <div class="tot"><table>
    <tr><td class="k">Subtotal (sin IVA)</td><td class="v">${esc(fmtMoneda(base))}</td></tr>
    ${iva > 0 ? `<tr><td class="k">IVA incluido</td><td class="v">${esc(fmtMoneda(iva))}</td></tr>` : ''}
  </table></div>
  <div class="grand"><div class="g1">TOTAL A PAGAR</div><div class="g2">${esc(fmtMoneda(total))}</div></div>
  <div class="letras">${esc(enLetras(total))}</div>
  <div class="foot">
    Este documento es un <b>RECORDATORIO de pedido</b>, no es factura de venta. La facturación se realiza posteriormente.<br>
    ¡Gracias por su pedido! — ${esc(EMPRESA.nombre)}
  </div>
</div>
</body></html>`;
}

// ── Texto para WhatsApp (sin HTML) ────────────────────────────
function textoRecordatorio(f: Factura): string {
  const fecha = new Date(f.creadoEn);
  const n = (x: number | string) => fmtMoneda(x);
  const { iva, base, total } = desgloseIva(f);
  const v = f.vendedor as any;
  let t = '';
  t += `*${EMPRESA.nombre}*\n`;
  t += `NIT. ${EMPRESA.nit}\n`;
  t += `RECORDATORIO DE PEDIDO (no es factura)\n`;
  t += `No. FAC-${String(f.consecutivo).padStart(4, '0')}\n`;
  t += `Fecha: ${fecha.toLocaleDateString('es-CO')} ${fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}\n`;
  if (f.metodoPago) t += `Pago: ${LABEL_METODO[f.metodoPago] ?? f.metodoPago}\n`;
  t += `--------------------------------\n`;
  t += `Cliente: ${f.cliente?.nombre ?? '—'}\n`;
  if (v?.nombre) t += `Asesor: ${v.nombre}${v?.telefono ? ' · Tel ' + v.telefono : ''}\n`;
  t += `--------------------------------\n`;
  f.items.forEach(i => {
    t += `${Math.abs(i.cantidad)}x ${i.producto?.nombre ?? 'Producto'}\n   ${n(i.total)}\n`;
  });
  t += `--------------------------------\n`;
  t += `Subtotal (sin IVA): ${n(base)}\n`;
  if (iva > 0) t += `IVA incluido: ${n(iva)}\n`;
  t += `*TOTAL A PAGAR: ${n(total)}*\n`;
  t += `${enLetras(total)}\n`;
  t += `--------------------------------\n`;
  t += `¡Gracias por su pedido!`;
  return t;
}

export function Recibo({ factura, onCerrar }: { factura: Factura; onCerrar: () => void }) {
  const html = htmlRecordatorio(factura);
  const texto = textoRecordatorio(factura);
  const tel = factura.cliente?.telefono?.replace(/\D/g, '');

  const imprimir = () => {
    const win = window.open('', '_blank', 'width=720,height=800');
    if (!win) { alert('Permite las ventanas emergentes para imprimir.'); return; }
    win.document.write(html.replace('</body>',
      '<button onclick="window.print()" style="position:fixed;top:8px;right:8px;padding:8px 14px;font-size:14px;cursor:pointer">Imprimir / PDF</button></body>'));
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 110,
      display: 'grid', placeItems: 'center', padding: 16,
    }} onClick={onCerrar}>
      <div className="card" style={{ width: '100%', maxWidth: 540, display: 'grid', gap: 10 }} onClick={e => e.stopPropagation()}>
        <iframe title="recordatorio" srcDoc={html} style={{
          width: '100%', height: '56vh', border: '1px solid var(--border)', borderRadius: 8, background: '#fff',
        }} />
        <button className="btn" onClick={imprimir}>Imprimir / PDF</button>
        {tel && (
          <a className="btn" style={{ textAlign: 'center', textDecoration: 'none', background: 'var(--green)', color: '#04221a' }}
            href={`https://wa.me/57${tel}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">
            Enviar por WhatsApp
          </a>
        )}
        <button className="btn btn-ghost" onClick={onCerrar}>Cerrar</button>
      </div>
    </div>
  );
}

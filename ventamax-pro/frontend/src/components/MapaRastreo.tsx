import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fmtMoneda } from '../api/formato';
import type { PosicionViva, PuntoRecorrido, OperacionRecorrido, RecorridoVendedor } from '../api/tipos';

// Paleta para distinguir vendedores cuando se ven varios recorridos a la vez.
export const PALETA = ['#00e5ff', '#ffaa00', '#c084fc', '#34d399', '#fb7185', '#fbbf24', '#38bdf8', '#a3e635', '#f472b6', '#f97316'];

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function popOperacion(o: OperacionRecorrido, vend?: string) {
  const cab = vend ? `<span style="opacity:.7">${esc(vend)}</span><br>` : '';
  return o.tipo === 'venta'
    ? `${cab}<b>${esc(o.cliente)}</b><br>🧾 Venta · ${hhmm(o.hora)}<br>Total: <b>${esc(fmtMoneda(o.total ?? 0))}</b><br>${o.refs ?? 0} ref · ${o.unidades ?? 0} und${o.direccion ? `<br>${esc(o.direccion)}` : ''}`
    : `${cab}<b>${esc(o.cliente)}</b><br>🚫 No compró · ${hhmm(o.hora)}<br>Causal: ${esc(o.causal ?? '')}${o.direccion ? `<br>${esc(o.direccion)}` : ''}`;
}

/** Mapa de rastreo: en vivo + recorrido(s) del día con operaciones clickeables. */
export function MapaRastreo({ vivos, recorrido, operaciones, rutas, alto = 460 }: {
  vivos: PosicionViva[];
  recorrido?: PuntoRecorrido[];
  operaciones?: OperacionRecorrido[];
  rutas?: RecorridoVendedor[]; // varios vendedores a la vez
  alto?: number;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capaVivo = useRef<L.LayerGroup | null>(null);
  const capaRuta = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    mapa.current = L.map(contenedor.current).setView([4.81, -75.69], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapa.current);
    capaRuta.current = L.layerGroup().addTo(mapa.current);
    capaVivo.current = L.layerGroup().addTo(mapa.current);
    return () => { mapa.current?.remove(); mapa.current = null; };
  }, []);

  // ── Recorrido(s) + operaciones ──
  useEffect(() => {
    if (!mapa.current || !capaRuta.current) return;
    const cap = capaRuta.current;
    cap.clearLayers();
    const todasCoords: [number, number][] = [];

    // Pin redondo con el número de orden del punto.
    const iconoNum = (n: number, color: string) => L.divIcon({
      className: '', iconSize: [16, 16], iconAnchor: [8, 8],
      html: `<div style="background:${color};color:#06121f;font-size:9px;font-weight:800;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1.5px solid #06121f;box-shadow:0 0 2px rgba(0,0,0,.6)">${n}</div>`,
    });
    // Marcador grande con emoji (inicio / fin).
    const iconoEmoji = (txt: string, bg: string) => L.divIcon({
      className: '', iconSize: [28, 28], iconAnchor: [14, 14],
      html: `<div style="background:${bg};font-size:15px;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #06121f;box-shadow:0 0 5px rgba(0,0,0,.7)">${txt}</div>`,
    });

    const dibujar = (pts: PuntoRecorrido[], ops: OperacionRecorrido[], color: string, vend?: string, inicioFin = true, numerar = true) => {
      const p = pts.filter(x => x.lat && x.lng);
      const coords = p.map(x => [x.lat, x.lng] as [number, number]);
      if (coords.length) {
        L.polyline(coords, { color, weight: 2.5, opacity: .95 }).addTo(cap);
        p.forEach((x, idx) => {
          const cab = vend ? `<b>${esc(vend)}</b><br>` : '';
          const popup = `${cab}Punto #${idx + 1}<br>${hhmm(x.creadoEn)}`;
          const m = numerar
            ? L.marker([x.lat, x.lng], { icon: iconoNum(idx + 1, color) })
            : L.circleMarker([x.lat, x.lng], { radius: 3, color, weight: 1, fillColor: color, fillOpacity: .7 });
          m.bindPopup(popup).addTo(cap);
        });
        todasCoords.push(...coords);
        if (inicioFin) {
          L.marker(coords[0], { icon: iconoEmoji('▶', '#00e5a0') }).bindTooltip(`${vend ? vend + ' · ' : ''}Inicio · ${hhmm(p[0].creadoEn)}`, { direction: 'top' }).addTo(cap);
          L.marker(coords[coords.length - 1], { icon: iconoEmoji('🏁', '#ffffff') }).bindTooltip(`${vend ? vend + ' · ' : ''}Fin · ${hhmm(p[p.length - 1].creadoEn)}`, { direction: 'top' }).addTo(cap);
        }
      }
      // Operaciones (venta / no compra): marcadores grandes ENCIMA de todo y fáciles de tocar.
      (ops ?? []).filter(o => o.lat && o.lng).forEach(o => {
        const icono = L.divIcon({
          className: '', iconSize: [26, 26], iconAnchor: [13, 13],
          html: `<div style="background:${o.tipo === 'venta' ? '#00e5a0' : '#ffaa00'};font-size:13px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 0 5px rgba(0,0,0,.7)">${o.tipo === 'venta' ? '🛒' : '🚫'}</div>`,
        });
        L.marker([o.lat, o.lng], { icon: icono, zIndexOffset: 1000 }).bindPopup(popOperacion(o, vend)).addTo(cap);
        todasCoords.push([o.lat, o.lng]);
      });
    };

    if (rutas && rutas.length) {
      // En la vista de varios vendedores: inicio/fin siempre; numeración solo si es uno (evita saturar).
      rutas.forEach((r, i) => dibujar(r.puntos, r.operaciones, PALETA[i % PALETA.length], r.nombre, true, rutas.length === 1));
    } else if (recorrido || operaciones) {
      dibujar(recorrido ?? [], operaciones ?? [], '#00e5ff');
    }

    if (todasCoords.length) mapa.current.fitBounds(L.latLngBounds(todasCoords), { padding: [30, 30], maxZoom: 16 });
  }, [recorrido, operaciones, rutas]);

  // ── Marcadores en vivo ──
  useEffect(() => {
    if (!mapa.current || !capaVivo.current) return;
    capaVivo.current.clearLayers();
    const validos = vivos.filter(v => v.lat && v.lng);
    validos.forEach(v => {
      L.circleMarker([v.lat, v.lng], { radius: 9, color: '#fff', weight: 2.5, fillColor: '#0044ff', fillOpacity: 1 })
        .bindTooltip(`${v.nombre} · hace ${v.haceSegundos}s`, { direction: 'top' }).addTo(capaVivo.current!);
    });
    const hayRuta = (recorrido && recorrido.length) || (rutas && rutas.length);
    if (validos.length && !hayRuta) {
      mapa.current.fitBounds(L.latLngBounds(validos.map(v => [v.lat, v.lng])), { padding: [40, 40], maxZoom: 15 });
    }
  }, [vivos, recorrido, rutas]);

  return (
    <div ref={contenedor} style={{ height: alto, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
  );
}

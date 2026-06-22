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

    const dibujar = (pts: PuntoRecorrido[], ops: OperacionRecorrido[], color: string, vend?: string, conInicioFin = true) => {
      const p = pts.filter(x => x.lat && x.lng);
      const coords = p.map(x => [x.lat, x.lng] as [number, number]);
      if (coords.length) {
        L.polyline(coords, { color, weight: 2.5, opacity: .95 }).addTo(cap);
        p.forEach(x => L.circleMarker([x.lat, x.lng], { radius: 3, color, weight: 1, fillColor: color, fillOpacity: .7 })
          .bindPopup(`${vend ? `<b>${esc(vend)}</b><br>` : ''}Punto de conexión<br>${hhmm(x.creadoEn)}`).addTo(cap));
        todasCoords.push(...coords);
        if (conInicioFin) {
          L.circleMarker(coords[0], { radius: 7, color: '#06121f', weight: 2, fillColor: '#00e5a0', fillOpacity: 1 }).bindTooltip(`${vend ? vend + ' · ' : ''}Inicio`, { direction: 'top' }).addTo(cap);
          L.circleMarker(coords[coords.length - 1], { radius: 7, color: '#06121f', weight: 2, fillColor: '#ff4060', fillOpacity: 1 }).bindTooltip(`${vend ? vend + ' · ' : ''}Último`, { direction: 'top' }).addTo(cap);
        }
      }
      (ops ?? []).filter(o => o.lat && o.lng).forEach(o => {
        L.circleMarker([o.lat, o.lng], { radius: 7, color: '#fff', weight: 2, fillColor: o.tipo === 'venta' ? '#00e5a0' : '#ffaa00', fillOpacity: 1 })
          .bindPopup(popOperacion(o, vend)).addTo(cap);
        todasCoords.push([o.lat, o.lng]);
      });
    };

    if (rutas && rutas.length) {
      rutas.forEach((r, i) => dibujar(r.puntos, r.operaciones, PALETA[i % PALETA.length], r.nombre, false));
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

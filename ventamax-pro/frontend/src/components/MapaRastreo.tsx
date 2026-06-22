import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fmtMoneda } from '../api/formato';
import type { PosicionViva, PuntoRecorrido, OperacionRecorrido } from '../api/tipos';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Mapa de rastreo: marcadores en vivo + recorrido del día + operaciones clickeables. */
export function MapaRastreo({ vivos, recorrido, operaciones, alto = 460 }: {
  vivos: PosicionViva[];
  recorrido?: PuntoRecorrido[];
  operaciones?: OperacionRecorrido[];
  alto?: number;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capaVivo = useRef<L.LayerGroup | null>(null);
  const capaRuta = useRef<L.LayerGroup | null>(null);
  const capaOps = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    mapa.current = L.map(contenedor.current).setView([4.81, -75.69], 12); // Eje cafetero
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapa.current);
    capaRuta.current = L.layerGroup().addTo(mapa.current);
    capaOps.current = L.layerGroup().addTo(mapa.current);
    capaVivo.current = L.layerGroup().addTo(mapa.current);
    return () => { mapa.current?.remove(); mapa.current = null; };
  }, []);

  // ── Recorrido del día (línea delgada que une los puntos de conexión) ──
  useEffect(() => {
    if (!mapa.current || !capaRuta.current) return;
    capaRuta.current.clearLayers();
    const pts = (recorrido ?? []).filter(p => p.lat && p.lng);
    if (!pts.length) return;
    const coords = pts.map(p => [p.lat, p.lng] as [number, number]);
    // Línea delgada y resaltada del trayecto.
    L.polyline(coords, { color: '#00e5ff', weight: 2.5, opacity: .95 }).addTo(capaRuta.current);
    // Cada punto de conexión, clickeable con su hora.
    pts.forEach(p => {
      L.circleMarker([p.lat, p.lng], { radius: 3.5, color: '#00e5ff', weight: 1, fillColor: '#00e5ff', fillOpacity: .7 })
        .bindPopup(`<b>Punto de conexión</b><br>${hhmm(p.creadoEn)}`)
        .addTo(capaRuta.current!);
    });
    const ini = pts[0], fin = pts[pts.length - 1];
    L.circleMarker([ini.lat, ini.lng], { radius: 8, color: '#06121f', weight: 2, fillColor: '#00e5a0', fillOpacity: 1 })
      .bindTooltip('Inicio', { direction: 'top' }).addTo(capaRuta.current);
    L.circleMarker([fin.lat, fin.lng], { radius: 8, color: '#06121f', weight: 2, fillColor: '#ff4060', fillOpacity: 1 })
      .bindTooltip('Último punto', { direction: 'top' }).addTo(capaRuta.current);
    mapa.current.fitBounds(L.latLngBounds(coords), { padding: [30, 30], maxZoom: 16 });
  }, [recorrido]);

  // ── Operaciones (ventas / visitas) — clickeables con resumen ──
  useEffect(() => {
    if (!mapa.current || !capaOps.current) return;
    capaOps.current.clearLayers();
    (operaciones ?? []).filter(o => o.lat && o.lng).forEach(o => {
      const venta = o.tipo === 'venta';
      const html = venta
        ? `<b>${esc(o.cliente)}</b><br>🧾 Venta · ${hhmm(o.hora)}<br>Total: <b>${esc(fmtMoneda(o.total ?? 0))}</b><br>${o.refs ?? 0} ref · ${o.unidades ?? 0} und${o.direccion ? `<br>${esc(o.direccion)}` : ''}`
        : `<b>${esc(o.cliente)}</b><br>🚫 No compró · ${hhmm(o.hora)}<br>Causal: ${esc(o.causal ?? '')}${o.direccion ? `<br>${esc(o.direccion)}` : ''}`;
      L.circleMarker([o.lat, o.lng], {
        radius: 7, color: '#fff', weight: 2,
        fillColor: venta ? '#00e5a0' : '#ffaa00', fillOpacity: 1,
      }).bindPopup(html).addTo(capaOps.current!);
    });
  }, [operaciones]);

  // ── Marcadores en vivo ──
  useEffect(() => {
    if (!mapa.current || !capaVivo.current) return;
    capaVivo.current.clearLayers();
    const validos = vivos.filter(v => v.lat && v.lng);
    validos.forEach(v => {
      L.circleMarker([v.lat, v.lng], { radius: 9, color: '#fff', weight: 2.5, fillColor: '#0044ff', fillOpacity: 1 })
        .bindTooltip(`${v.nombre} · hace ${v.haceSegundos}s`, { direction: 'top' })
        .addTo(capaVivo.current!);
    });
    if (validos.length && !(recorrido && recorrido.length)) {
      mapa.current.fitBounds(L.latLngBounds(validos.map(v => [v.lat, v.lng])), { padding: [40, 40], maxZoom: 15 });
    }
  }, [vivos, recorrido]);

  return (
    <div ref={contenedor} style={{ height: alto, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
  );
}

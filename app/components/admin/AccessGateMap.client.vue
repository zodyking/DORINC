<script setup lang="ts">
import type { GeoPoint } from '#shared/geo/point-in-polygon'
import type { AccessMapEvent } from '~/utils/access-gate-map'

const props = defineProps<{
  events: AccessMapEvent[]
  polygon: GeoPoint[]
  drawing: boolean
}>()

const emit = defineEmits<{
  'update:polygon': [points: GeoPoint[]]
  'ban-ip': [ip: string]
}>()

const mapEl = ref<HTMLElement | null>(null)

// Leaflet instances are kept outside reactive state to avoid deep proxies.
let L: typeof import('leaflet') | null = null
let map: import('leaflet').Map | null = null
let clusterGroup: import('leaflet').LayerGroup | null = null
let polygonLayer: import('leaflet').Polygon | null = null
let traceLayer: import('leaflet').Polyline | null = null

// Freehand drawing state.
let tracing = false
let tracePoints: GeoPoint[] = []
let lastContainerPt: import('leaflet').Point | null = null
const MIN_TRACE_PX = 6
const MAX_TRACE_POINTS = 800

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[ch] ?? ch
  ))
}

function markerColor(ev: AccessMapEvent): string {
  if (ev.outcome === 'blocked') return '#dc2626'
  if (ev.eventType === 'login') {
    return ev.outcome === 'login_failed' ? '#f59e0b' : '#4f46e5'
  }
  return '#0ea5e9'
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function popupHtml(ev: AccessMapEvent): string {
  const rows: string[] = []
  const who = ev.userName || ev.userEmail || (ev.eventType === 'login' ? 'Unknown user' : 'Anonymous visitor')
  rows.push(`<b>${escapeHtml(who)}</b>`)
  if (ev.userEmail && ev.userEmail !== who) rows.push(escapeHtml(ev.userEmail))
  rows.push(`Type: ${escapeHtml(ev.eventType)} · ${escapeHtml(ev.outcome)}`)
  if (ev.locationLabel) rows.push(`Location: ${escapeHtml(ev.locationLabel)}`)
  if (ev.ipAddress) rows.push(`IP: ${escapeHtml(ev.ipAddress)}`)
  if (ev.path) rows.push(`Path: ${escapeHtml(ev.path)}`)
  rows.push(`When: ${escapeHtml(formatWhen(ev.createdAt))}`)
  const banBtn = ev.ipAddress
    ? `<button type="button" class="ag-ban-btn" data-ip="${escapeHtml(ev.ipAddress)}">Ban this IP</button>`
    : ''
  return `<div class="ag-popup">${rows.join('<br>')}${banBtn ? `<div style="margin-top:8px">${banBtn}</div>` : ''}</div>`
}

function renderMarkers() {
  if (!L || !map || !clusterGroup) return
  clusterGroup.clearLayers()
  for (const ev of props.events) {
    if (ev.latitude == null || ev.longitude == null) continue
    const color = markerColor(ev)
    const icon = L.divIcon({
      className: 'ag-marker',
      html: `<span class="ag-dot" style="background:${color}"></span>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    })
    const marker = L.marker([ev.latitude, ev.longitude], { icon })
    marker.bindPopup(popupHtml(ev))
    clusterGroup.addLayer(marker)
  }
}

function renderPolygon() {
  if (!L || !map) return
  if (polygonLayer) {
    polygonLayer.remove()
    polygonLayer = null
  }
  const pts = props.polygon
  if (pts.length >= 3) {
    const latlngs = pts.map(p => [p.lat, p.lng]) as [number, number][]
    polygonLayer = L.polygon(latlngs, {
      color: '#4f46e5',
      weight: 2,
      fillOpacity: 0.12,
    }).addTo(map)
  }
}

function fitToData() {
  if (!L || !map) return
  const coords: [number, number][] = []
  for (const ev of props.events) {
    if (ev.latitude != null && ev.longitude != null) coords.push([ev.latitude, ev.longitude])
  }
  for (const p of props.polygon) coords.push([p.lat, p.lng])
  if (coords.length) {
    map.fitBounds(L.latLngBounds(coords).pad(0.2), { maxZoom: 12 })
  }
  else {
    map.setView([39.5, -98.35], 4)
  }
}

function clearTraceLayer() {
  if (traceLayer) {
    traceLayer.remove()
    traceLayer = null
  }
}

function updateTraceLayer() {
  if (!L || !map) return
  const latlngs = tracePoints.map(p => [p.lat, p.lng]) as [number, number][]
  if (!traceLayer) {
    traceLayer = L.polyline(latlngs, { color: '#4f46e5', weight: 2, dashArray: '4 4' }).addTo(map)
  }
  else {
    traceLayer.setLatLngs(latlngs)
  }
}

function onPointerDown(ev: PointerEvent) {
  if (!props.drawing || !map || ev.button != null && ev.button !== 0) return
  ev.preventDefault()
  tracing = true
  tracePoints = []
  clearTraceLayer()
  const latlng = map.mouseEventToLatLng(ev)
  tracePoints.push({ lat: latlng.lat, lng: latlng.lng })
  lastContainerPt = map.mouseEventToContainerPoint(ev)
  try {
    (ev.target as Element).setPointerCapture?.(ev.pointerId)
  }
  catch {
    // capture is best-effort
  }
}

function onPointerMove(ev: PointerEvent) {
  if (!tracing || !map) return
  ev.preventDefault()
  const pt = map.mouseEventToContainerPoint(ev)
  if (lastContainerPt && pt.distanceTo(lastContainerPt) < MIN_TRACE_PX) return
  lastContainerPt = pt
  const latlng = map.mouseEventToLatLng(ev)
  tracePoints.push({ lat: latlng.lat, lng: latlng.lng })
  if (tracePoints.length > MAX_TRACE_POINTS) {
    // Downsample to keep the polygon light while preserving its shape.
    tracePoints = tracePoints.filter((_, i) => i % 2 === 0)
  }
  updateTraceLayer()
}

function onPointerUp() {
  if (!tracing) return
  tracing = false
  clearTraceLayer()
  if (tracePoints.length >= 3) {
    emit('update:polygon', tracePoints.slice())
  }
  tracePoints = []
  lastContainerPt = null
}

function setDrawInteractions(enabled: boolean) {
  if (!map) return
  const container = map.getContainer()
  if (enabled) {
    map.dragging.disable()
    map.doubleClickZoom.disable()
    map.boxZoom.disable()
    container.style.cursor = 'crosshair'
  }
  else {
    map.dragging.enable()
    map.doubleClickZoom.enable()
    map.boxZoom.enable()
    container.style.cursor = ''
    // Abandon any in-progress stroke when leaving draw mode.
    tracing = false
    tracePoints = []
    lastContainerPt = null
    clearTraceLayer()
  }
}

function invalidateMapSize() {
  if (!map) return
  nextTick(() => {
    requestAnimationFrame(() => {
      map?.invalidateSize({ animate: false })
    })
  })
}

async function initMap() {
  if (!mapEl.value) return
  await import('leaflet/dist/leaflet.css')
  await import('leaflet.markercluster/dist/MarkerCluster.css')
  await import('leaflet.markercluster/dist/MarkerCluster.Default.css')
  const leafletMod = await import('leaflet')
  L = ((leafletMod as { default?: typeof import('leaflet') }).default ?? leafletMod) as typeof import('leaflet')
  await import('leaflet.markercluster')

  map = L.map(mapEl.value, { scrollWheelZoom: true }).setView([39.5, -98.35], 4)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map)

  const makeCluster = (L as typeof import('leaflet') & {
    markerClusterGroup?: () => import('leaflet').LayerGroup
  }).markerClusterGroup
  clusterGroup = makeCluster ? makeCluster() : L.layerGroup()
  map.addLayer(clusterGroup)

  const container = map.getContainer()
  container.addEventListener('pointerdown', onPointerDown)
  container.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)

  map.on('popupopen', (e: import('leaflet').PopupEvent) => {
    const node = (e.popup.getElement?.() ?? null) as HTMLElement | null
    const btn = node?.querySelector<HTMLButtonElement>('.ag-ban-btn')
    if (btn) {
      btn.addEventListener('click', () => {
        const ip = btn.dataset.ip
        if (ip) emit('ban-ip', ip)
      }, { once: true })
    }
  })

  renderMarkers()
  renderPolygon()
  fitToData()
  if (props.drawing) setDrawInteractions(true)
  invalidateMapSize()
}

let resizeObserver: ResizeObserver | null = null
let intersectionObserver: IntersectionObserver | null = null

onMounted(() => {
  void initMap().then(() => {
    if (!mapEl.value) return
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => invalidateMapSize())
      resizeObserver.observe(mapEl.value)
    }
    if (typeof IntersectionObserver !== 'undefined') {
      intersectionObserver = new IntersectionObserver((entries) => {
        if (entries.some(entry => entry.isIntersecting)) invalidateMapSize()
      })
      intersectionObserver.observe(mapEl.value)
    }
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  intersectionObserver?.disconnect()
  intersectionObserver = null
  if (map) {
    const container = map.getContainer()
    container.removeEventListener('pointerdown', onPointerDown)
    container.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    map.remove()
    map = null
  }
})

watch(() => props.events, () => {
  renderMarkers()
}, { deep: true })

watch(() => props.polygon, () => {
  renderPolygon()
}, { deep: true })

watch(() => props.drawing, (enabled) => {
  setDrawInteractions(enabled)
  renderPolygon()
  invalidateMapSize()
})
</script>

<template>
  <div ref="mapEl" class="ag-map" />
</template>

<style>
.ag-map {
  width: 100%;
  height: 420px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  z-index: 0;
}
.ag-marker .ag-dot {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.25);
}
.ag-popup {
  font-size: 12.5px;
  line-height: 1.5;
  color: #0f172a;
}
.ag-ban-btn {
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
</style>

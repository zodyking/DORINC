<script setup lang="ts">
import type { GeoPoint } from '#shared/geo/point-in-polygon'
import type { SecurityEvent, SecurityZone } from '~/utils/security-center'
import { eventMarkerColor, formatWhen, outcomeLabel } from '~/utils/security-center'

const props = defineProps<{
  events: SecurityEvent[]
  zones: SecurityZone[]
  drawing: boolean
  /** Zone currently being edited, highlighted and replaced by the next trace. */
  editingZoneId: string | null
}>()

const emit = defineEmits<{
  'trace': [points: GeoPoint[]]
  'ban-ip': [ip: string]
  'select-zone': [id: string]
}>()

const mapEl = ref<HTMLElement | null>(null)

// Leaflet instances live outside reactive state so Vue never proxies them.
let L: typeof import('leaflet') | null = null
let map: import('leaflet').Map | null = null
let clusterGroup: import('leaflet').LayerGroup | null = null
let zoneLayers: import('leaflet').Polygon[] = []
let traceLayer: import('leaflet').Polyline | null = null

let tracing = false
let tracePoints: GeoPoint[] = []
let lastContainerPt: import('leaflet').Point | null = null
const MIN_TRACE_PX = 6
const MAX_TRACE_POINTS = 1200

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[ch] ?? ch
  ))
}

function popupHtml(event: SecurityEvent): string {
  const rows: string[] = []
  const who = event.userName
    || event.userEmail
    || event.attemptedIdentifier
    || (event.eventType === 'login' ? 'Unknown account' : 'Anonymous visitor')

  rows.push(`<b>${escapeHtml(who)}</b>`)
  rows.push(`${escapeHtml(outcomeLabel(event.outcome))}${event.enforced ? ' (enforced)' : ''}`)
  if (event.attemptedIdentifier && event.attemptedIdentifier !== who) {
    rows.push(`Tried: ${escapeHtml(event.attemptedIdentifier)}`)
  }
  if (event.failureReason) rows.push(`Reason: ${escapeHtml(event.failureReason.replace(/_/g, ' '))}`)
  if (event.locationLabel) rows.push(`Location: ${escapeHtml(event.locationLabel)}`)
  if (event.ipAddress) rows.push(`IP: ${escapeHtml(event.ipAddress)}`)
  if (event.path) rows.push(`Path: ${escapeHtml(event.path)}`)
  rows.push(`When: ${escapeHtml(formatWhen(event.createdAt))}`)

  const banButton = event.ipAddress
    ? `<div style="margin-top:8px"><button type="button" class="sec-ban-btn" data-ip="${escapeHtml(event.ipAddress)}">Ban this IP</button></div>`
    : ''
  return `<div class="sec-popup">${rows.join('<br>')}${banButton}</div>`
}

function renderMarkers() {
  if (!L || !map || !clusterGroup) return
  clusterGroup.clearLayers()
  for (const event of props.events) {
    if (event.latitude == null || event.longitude == null) continue
    const icon = L.divIcon({
      className: 'sec-marker',
      html: `<span class="sec-dot" style="background:${eventMarkerColor(event)}"></span>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    })
    const marker = L.marker([event.latitude, event.longitude], { icon })
    marker.bindPopup(popupHtml(event))
    clusterGroup.addLayer(marker)
  }
}

function renderZones() {
  if (!L || !map) return
  for (const layer of zoneLayers) layer.remove()
  zoneLayers = []

  for (const zone of props.zones) {
    if (zone.polygon.length < 3) continue
    const isEditing = zone.id === props.editingZoneId
    const color = zone.kind === 'block' ? '#dc2626' : zone.color
    const layer = L.polygon(zone.polygon.map(p => [p.lat, p.lng]) as [number, number][], {
      color,
      weight: isEditing ? 3 : 2,
      dashArray: zone.enabled ? undefined : '5 5',
      fillOpacity: zone.enabled ? (isEditing ? 0.22 : 0.12) : 0.04,
    }).addTo(map)
    layer.bindTooltip(`${zone.name} · ${zone.kind === 'block' ? 'blocked' : 'allowed'}${zone.enabled ? '' : ' (off)'}`)
    layer.on('click', () => emit('select-zone', zone.id))
    zoneLayers.push(layer)
  }
}

function fitToData() {
  if (!L || !map) return
  const coords: [number, number][] = []
  for (const event of props.events) {
    if (event.latitude != null && event.longitude != null) coords.push([event.latitude, event.longitude])
  }
  for (const zone of props.zones) {
    for (const point of zone.polygon) coords.push([point.lat, point.lng])
  }
  if (coords.length) {
    map.fitBounds(L.latLngBounds(coords).pad(0.2), { maxZoom: 12 })
  }
  else {
    map.setView([39.5, -98.35], 4)
  }
}

function clearTraceLayer() {
  traceLayer?.remove()
  traceLayer = null
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
  if (!props.drawing || !map || (ev.button != null && ev.button !== 0)) return
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
    // Pointer capture is best-effort.
  }
}

function onPointerMove(ev: PointerEvent) {
  if (!tracing || !map) return
  ev.preventDefault()
  const point = map.mouseEventToContainerPoint(ev)
  if (lastContainerPt && point.distanceTo(lastContainerPt) < MIN_TRACE_PX) return
  lastContainerPt = point
  const latlng = map.mouseEventToLatLng(ev)
  tracePoints.push({ lat: latlng.lat, lng: latlng.lng })
  if (tracePoints.length > MAX_TRACE_POINTS) {
    tracePoints = tracePoints.filter((_, i) => i % 2 === 0)
  }
  updateTraceLayer()
}

function onPointerUp() {
  if (!tracing) return
  tracing = false
  clearTraceLayer()
  if (tracePoints.length >= 3) emit('trace', tracePoints.slice())
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
    return
  }
  map.dragging.enable()
  map.doubleClickZoom.enable()
  map.boxZoom.enable()
  container.style.cursor = ''
  tracing = false
  tracePoints = []
  lastContainerPt = null
  clearTraceLayer()
}

function invalidateMapSize() {
  if (!map) return
  nextTick(() => {
    requestAnimationFrame(() => map?.invalidateSize({ animate: false }))
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
    const button = node?.querySelector<HTMLButtonElement>('.sec-ban-btn')
    if (!button) return
    button.addEventListener('click', () => {
      const ip = button.dataset.ip
      if (ip) emit('ban-ip', ip)
    }, { once: true })
  })

  renderMarkers()
  renderZones()
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
  if (!map) return
  const container = map.getContainer()
  container.removeEventListener('pointerdown', onPointerDown)
  container.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  map.remove()
  map = null
})

watch(() => props.events, renderMarkers, { deep: true })
watch(() => props.zones, renderZones, { deep: true })
watch(() => props.editingZoneId, renderZones)
watch(() => props.drawing, (enabled) => {
  setDrawInteractions(enabled)
  invalidateMapSize()
})

defineExpose({ fitToData })
</script>

<template>
  <div ref="mapEl" class="sec-map" />
</template>

<style>
.sec-map {
  width: 100%;
  height: 460px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  z-index: 0;
}
.sec-marker .sec-dot {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.25);
}
.sec-popup {
  font-size: 12.5px;
  line-height: 1.5;
  color: #0f172a;
}
.sec-ban-btn {
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.sec-ban-btn:hover { background: #fee2e2; }
.sec-ban-btn:focus-visible { outline: 2px solid #dc2626; outline-offset: 2px; }
@media (max-width: 720px) {
  .sec-map { height: 340px; }
}
</style>

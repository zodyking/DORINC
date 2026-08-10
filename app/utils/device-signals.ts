/**
 * Collect browser/device signals for the security access-gate visit table.
 * Fingerprints are short hashes — never raw canvas/audio buffers.
 */
import { UAParser } from 'ua-parser-js'
import { getOrCreateDeviceId, peekDeviceId } from '~/utils/device-id'
import type { DeviceSignals } from '#shared/validators/device-signals'

const CACHE_KEY = 'dorinc_device_signals_v1'
const CACHE_TTL_MS = 60 * 60 * 1000

type CachedSignals = { at: number, signals: DeviceSignals }

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  if (typeof crypto?.subtle?.digest === 'function') {
    const digest = await crypto.subtle.digest('SHA-256', data)
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
  }
  // Fallback — non-crypto hash for older browsers.
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function readCache(): DeviceSignals | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedSignals
    if (!parsed?.at || Date.now() - parsed.at > CACHE_TTL_MS) return null
    return parsed.signals ?? null
  }
  catch {
    return null
  }
}

function writeCache(signals: DeviceSignals): void {
  try {
    const payload: CachedSignals = { at: Date.now(), signals }
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  }
  catch {
    // ignore quota / private mode
  }
}

function detectDeviceType(deviceType: string | undefined): DeviceSignals['deviceType'] {
  const type = (deviceType || '').toLowerCase()
  if (type === 'mobile') return 'mobile'
  if (type === 'tablet') return 'tablet'
  if (type === 'smarttv' || type === 'wearable' || type === 'console' || type === 'embedded') {
    return 'unknown'
  }
  // UA-parser leaves desktop type empty.
  return 'desktop'
}

function collectGpuRenderer(): { renderer: string | null, webglFingerprintSeed: string | null } {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl || !(gl instanceof WebGLRenderingContext)) {
      return { renderer: null, webglFingerprintSeed: null }
    }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const vendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) ?? '') : ''
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '') : ''
    const label = [vendor, renderer].filter(Boolean).join(' | ').slice(0, 300) || null
    const seed = [
      gl.getParameter(gl.VERSION),
      gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      gl.getParameter(gl.VENDOR),
      gl.getParameter(gl.RENDERER),
      vendor,
      renderer,
    ].join('~')
    return { renderer: label, webglFingerprintSeed: seed }
  }
  catch {
    return { renderer: null, webglFingerprintSeed: null }
  }
}

async function collectCanvasFingerprint(): Promise<string | null> {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 240
    canvas.height = 60
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.textBaseline = 'top'
    ctx.font = '14px Arial'
    ctx.fillStyle = '#f60'
    ctx.fillRect(0, 0, 240, 60)
    ctx.fillStyle = '#069'
    ctx.fillText('dorinc-device', 4, 4)
    ctx.strokeStyle = '#ff0'
    ctx.beginPath()
    ctx.arc(50, 30, 20, 0, Math.PI * 2)
    ctx.stroke()
    return sha256Hex(canvas.toDataURL())
  }
  catch {
    return null
  }
}

async function collectAudioFingerprint(): Promise<string | null> {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return null
    const ctx = new AudioCtx()
    const oscillator = ctx.createOscillator()
    const compressor = ctx.createDynamicsCompressor()
    const analyser = ctx.createAnalyser()
    oscillator.type = 'triangle'
    oscillator.frequency.value = 10000
    compressor.threshold.value = -50
    compressor.knee.value = 40
    compressor.ratio.value = 12
    compressor.attack.value = 0
    compressor.release.value = 0.25
    oscillator.connect(compressor)
    compressor.connect(analyser)
    analyser.connect(ctx.destination)
    oscillator.start(0)
    const samples = new Float32Array(analyser.frequencyBinCount)
    analyser.getFloatFrequencyData(samples)
    oscillator.stop(0)
    await ctx.close().catch(() => {})
    let sum = 0
    for (let i = 0; i < samples.length; i++) sum += Math.abs(samples[i] ?? 0)
    return sha256Hex(String(sum))
  }
  catch {
    return null
  }
}

/** Collect (or reuse cached) device signals for the current browser. */
export async function collectDeviceSignals(): Promise<DeviceSignals> {
  const cached = readCache()
  const deviceId = await getOrCreateDeviceId().catch(() => peekDeviceId())

  if (cached) {
    return { ...cached, deviceId: deviceId ?? cached.deviceId ?? null }
  }

  const uaRaw = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const parsed = new UAParser(uaRaw).getResult()
  const osLabel = [parsed.os.name, parsed.os.version].filter(Boolean).join(' ').trim() || null
  const gpu = collectGpuRenderer()
  const [canvasFingerprint, webglFingerprint, audioFingerprint] = await Promise.all([
    collectCanvasFingerprint(),
    gpu.webglFingerprintSeed ? sha256Hex(gpu.webglFingerprintSeed) : Promise.resolve(null),
    collectAudioFingerprint(),
  ])

  const nav = typeof navigator !== 'undefined' ? navigator as Navigator & { deviceMemory?: number } : null
  const screenRes = typeof screen !== 'undefined'
    ? `${screen.width}x${screen.height}`
    : null

  const signals: DeviceSignals = {
    userAgent: uaRaw ? uaRaw.slice(0, 500) : null,
    os: osLabel,
    deviceType: detectDeviceType(parsed.device.type),
    screenResolution: screenRes,
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio ?? null : null,
    cpuCores: nav?.hardwareConcurrency ?? null,
    deviceMemoryGb: typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : null,
    gpuRenderer: gpu.renderer,
    canvasFingerprint,
    webglFingerprint,
    audioFingerprint,
    timezone: (() => {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null }
      catch { return null }
    })(),
    language: nav?.language ?? null,
    maxTouchPoints: nav?.maxTouchPoints ?? null,
    deviceId: deviceId ?? null,
  }

  writeCache(signals)
  return signals
}

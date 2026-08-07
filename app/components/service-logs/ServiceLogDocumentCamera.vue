<script setup lang="ts">
/**
 * In-app service log camera — take front/back photos.
 * Document border detection will return later; capture is unrestricted for now.
 */
import {
  SERVICE_LOG_MAX_PHOTOS,
  serviceLogNextPhotoPrompt,
  serviceLogPhotoCountLabel,
  serviceLogPhotoSlotLabel,
} from '#shared/service-log-photos'

const props = withDefaults(defineProps<{
  mode?: 'inline' | 'fullscreen'
  open?: boolean
  photos?: Array<{ id: string, url: string }>
  maxPhotos?: number
}>(), {
  mode: 'inline',
  open: true,
  photos: () => [],
  maxPhotos: SERVICE_LOG_MAX_PHOTOS,
})

const emit = defineEmits<{
  captured: [file: File]
  remove: [id: string]
  close: []
  done: []
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const stream = ref<MediaStream | null>(null)
const cameraError = ref('')
const busy = ref(false)
const torchSupported = ref(false)
const torchOn = ref(false)
const flashPulse = ref(false)
const captureHint = ref('')

const isFullscreen = computed(() => props.mode === 'fullscreen')
const active = computed(() => props.open !== false)
const photoCount = computed(() => props.photos.length)
const atMax = computed(() => photoCount.value >= props.maxPhotos)
const prompt = computed(() => serviceLogNextPhotoPrompt(photoCount.value))
const countLabel = computed(() => serviceLogPhotoCountLabel(photoCount.value))
const canFinish = computed(() => photoCount.value >= 1)
const statusMessage = computed(() => {
  if (atMax.value) return 'Front and back ready — remove one to retake'
  if (captureHint.value) return captureHint.value
  return photoCount.value === 0
    ? 'Take a clear photo of the front of the service log'
    : 'Take a clear photo of the back of the service log'
})

let stopped = true

async function startCamera() {
  cameraError.value = ''
  captureHint.value = ''
  torchSupported.value = false
  torchOn.value = false
  if (!import.meta.client) return
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraError.value = 'Camera not available on this device.'
    return
  }
  try {
    stopCamera()
    stopped = false
    const media = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    })
    if (stopped) {
      media.getTracks().forEach(t => t.stop())
      return
    }
    stream.value = media
    const track = media.getVideoTracks()[0]
    const caps = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean } | undefined
    torchSupported.value = Boolean(caps?.torch)
    await nextTick()
    if (videoRef.value) {
      videoRef.value.srcObject = media
      await videoRef.value.play().catch(() => {})
    }
  }
  catch {
    cameraError.value = 'Could not open the camera. Check permissions and try again.'
  }
}

function stopCamera() {
  stopped = true
  void setTorch(false)
  stream.value?.getTracks().forEach(t => t.stop())
  stream.value = null
  if (videoRef.value) videoRef.value.srcObject = null
  torchSupported.value = false
  torchOn.value = false
}

async function setTorch(on: boolean) {
  const track = stream.value?.getVideoTracks()[0]
  if (!track || !torchSupported.value) return
  try {
    await track.applyConstraints({
      advanced: [{ torch: on } as unknown as MediaTrackConstraintSet],
    })
    torchOn.value = on
  }
  catch {
    torchOn.value = false
  }
}

async function toggleTorch() {
  await setTorch(!torchOn.value)
}

async function capture() {
  if (atMax.value || busy.value) return
  const video = videoRef.value
  const canvas = canvasRef.value
  if (!video || !canvas || !video.videoWidth) return

  busy.value = true
  flashPulse.value = true
  captureHint.value = ''
  try {
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) {
      captureHint.value = 'Could not save that photo — try again'
      return
    }
    const slot = photoCount.value === 0 ? 'front' : 'back'
    const file = new File([blob], `service-log-${slot}-${Date.now()}.jpg`, { type: 'image/jpeg' })
    emit('captured', file)
  }
  finally {
    busy.value = false
    window.setTimeout(() => { flashPulse.value = false }, 180)
  }
}

watch(active, (on) => {
  if (on) void startCamera()
  else stopCamera()
}, { immediate: true })

onBeforeUnmount(() => stopCamera())
</script>

<template>
  <Teleport to="body" :disabled="!isFullscreen">
    <div
      v-if="active"
      class="sl-doc-cam"
      :class="{
        'sl-doc-cam--fullscreen': isFullscreen,
        'sl-doc-cam--flash': flashPulse,
      }"
      role="dialog"
      :aria-modal="isFullscreen ? 'true' : undefined"
      aria-label="Service log camera"
    >
      <header v-if="isFullscreen" class="sl-doc-cam__top">
        <button
          type="button"
          class="sl-doc-cam__icon-btn"
          aria-label="Close camera"
          @click="emit('close')"
        >
          ✕
        </button>
        <div class="sl-doc-cam__top-copy">
          <strong>{{ atMax ? 'Photos ready' : (photoCount === 0 ? 'Front of log' : 'Back of log') }}</strong>
          <span>{{ prompt }}</span>
        </div>
        <button
          type="button"
          class="sl-doc-cam__icon-btn"
          :class="{ on: torchOn }"
          :disabled="!torchSupported || !stream"
          :aria-pressed="torchOn"
          :aria-label="torchOn ? 'Turn flash off' : 'Turn flash on'"
          @click="toggleTorch"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
            <path
              d="M9 2h6l-1.5 7H17l-7 13 1.2-8H7L9 2z"
              :fill="torchOn ? '#fde047' : 'currentColor'"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </header>

      <div class="sl-doc-cam__stage">
        <video
          ref="videoRef"
          class="sl-doc-cam__video"
          playsinline
          muted
          autoplay
        />
        <div class="sl-doc-cam__status">
          <strong>{{ statusMessage }}</strong>
          <span>{{ countLabel }}</span>
        </div>
      </div>

      <canvas ref="canvasRef" class="sl-doc-cam__canvas" />

      <p v-if="cameraError" class="sl-doc-cam__error">{{ cameraError }}</p>

      <div v-if="photos.length" class="sl-doc-cam__shots">
        <div
          v-for="(photo, index) in photos"
          :key="photo.id"
          class="sl-doc-cam__shot"
        >
          <img :src="photo.url" :alt="`${serviceLogPhotoSlotLabel(index)} of service log`">
          <span class="sl-doc-cam__shot-label">{{ serviceLogPhotoSlotLabel(index) }}</span>
          <button
            type="button"
            class="sl-doc-cam__shot-x"
            :aria-label="`Remove ${serviceLogPhotoSlotLabel(index).toLowerCase()} photo`"
            @click="emit('remove', photo.id)"
          >
            ×
          </button>
        </div>
      </div>

      <div v-if="isFullscreen" class="sl-doc-cam__dock">
        <button
          type="button"
          class="sl-doc-cam__side-btn"
          :disabled="!canFinish"
          @click="emit('done')"
        >
          {{ canFinish ? 'Use Photos' : 'Need photo' }}
        </button>
        <button
          type="button"
          class="sl-doc-cam__shutter"
          :disabled="busy || !stream || atMax"
          :aria-label="atMax ? 'Maximum photos reached' : (photoCount === 0 ? 'Take front photo' : 'Take back photo')"
          @click="capture"
        >
          <span class="sl-doc-cam__shutter-ring" />
        </button>
        <button
          type="button"
          class="sl-doc-cam__side-btn"
          :class="{ on: torchOn }"
          :disabled="!torchSupported || !stream"
          @click="toggleTorch"
        >
          {{ torchSupported ? (torchOn ? 'Flash On' : 'Flash') : 'No Flash' }}
        </button>
      </div>

      <div v-else class="sl-doc-cam__actions">
        <button
          type="button"
          class="btn primary"
          :disabled="busy || !stream || atMax"
          @click="capture"
        >
          {{ atMax ? 'Front & back captured' : (photoCount === 0 ? 'Take Front' : 'Take Back') }}
        </button>
        <button
          v-if="canFinish"
          type="button"
          class="btn"
          @click="emit('done')"
        >
          Use Photos
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sl-doc-cam { margin-top: 8px; }
.sl-doc-cam__stage {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  background: #0f172a;
  aspect-ratio: 3 / 4;
  max-height: 62vh;
}
.sl-doc-cam__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #020617;
  display: block;
}
.sl-doc-cam__status {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.72);
  color: #f8fafc;
  font-size: 12px;
}
.sl-doc-cam__status strong { font-size: 13px; }
.sl-doc-cam__canvas { display: none; }
.sl-doc-cam__error { margin: 10px 12px 0; color: #fbbf24; font-size: 13px; }
.sl-doc-cam__shots {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 12px 14px 0;
}
.sl-doc-cam__shot {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  aspect-ratio: 3 / 4;
  background: #1e293b;
}
.sl-doc-cam__shot img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sl-doc-cam__shot-label {
  position: absolute;
  left: 8px;
  bottom: 8px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.75);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.sl-doc-cam__shot-x {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.75);
  color: #fff;
  cursor: pointer;
}
.sl-doc-cam__actions {
  display: flex;
  gap: 10px;
  margin: 12px;
}
.sl-doc-cam__actions .btn { flex: 1; min-height: 48px; }

.sl-doc-cam--fullscreen {
  position: fixed;
  inset: 0;
  z-index: 200;
  margin: 0;
  display: flex;
  flex-direction: column;
  background: #020617;
  color: #fff;
  min-height: 100vh;
  min-height: 100dvh;
  padding:
    env(safe-area-inset-top, 0)
    env(safe-area-inset-right, 0)
    env(safe-area-inset-bottom, 0)
    env(safe-area-inset-left, 0);
}
.sl-doc-cam--fullscreen .sl-doc-cam__stage {
  flex: 1;
  max-height: none;
  aspect-ratio: auto;
  border-radius: 0;
  min-height: 0;
}
.sl-doc-cam__top {
  display: grid;
  grid-template-columns: 48px 1fr 48px;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: linear-gradient(180deg, rgba(2, 6, 23, 0.85), transparent);
  position: relative;
  z-index: 2;
}
.sl-doc-cam__top-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: center;
  min-width: 0;
}
.sl-doc-cam__top-copy strong { font-size: 15px; font-weight: 800; }
.sl-doc-cam__top-copy span { font-size: 12px; color: #cbd5e1; }
.sl-doc-cam__icon-btn {
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.sl-doc-cam__icon-btn.on { background: rgba(250, 204, 21, 0.25); color: #fde047; }
.sl-doc-cam__icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.sl-doc-cam__dock {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  padding: 18px 20px 22px;
  background: linear-gradient(0deg, rgba(2, 6, 23, 0.95), rgba(2, 6, 23, 0.55));
}
.sl-doc-cam__side-btn {
  min-height: 44px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  padding: 0 14px;
}
.sl-doc-cam__side-btn.on { background: rgba(250, 204, 21, 0.22); color: #fde047; }
.sl-doc-cam__side-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sl-doc-cam__shutter {
  width: 78px;
  height: 78px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
}
.sl-doc-cam__shutter-ring {
  width: 68px;
  height: 68px;
  border-radius: 999px;
  border: 4px solid #fff;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.35) inset;
}
.sl-doc-cam__shutter:disabled { opacity: 0.45; cursor: not-allowed; }
.sl-doc-cam__shutter:not(:disabled):active .sl-doc-cam__shutter-ring { transform: scale(0.94); }
.sl-doc-cam--flash::after {
  content: '';
  position: absolute;
  inset: 0;
  background: #fff;
  opacity: 0.72;
  pointer-events: none;
  animation: slCamFlash 0.18s ease-out;
}
@keyframes slCamFlash {
  from { opacity: 0.85; }
  to { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .sl-doc-cam--flash::after { animation: none; opacity: 0; }
}
</style>

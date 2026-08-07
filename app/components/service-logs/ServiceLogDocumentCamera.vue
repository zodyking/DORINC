<script setup lang="ts">
/**
 * Document capture for service logs.
 * - mode="inline": compact preview (legacy / fallback)
 * - mode="fullscreen": 100dvh capture UI with shutter + torch/flash
 */
const props = withDefaults(defineProps<{
  mode?: 'inline' | 'fullscreen'
  open?: boolean
}>(), {
  mode: 'inline',
  open: true,
})

const emit = defineEmits<{
  captured: [file: File]
  close: []
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const stream = ref<MediaStream | null>(null)
const cameraError = ref('')
const busy = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const torchSupported = ref(false)
const torchOn = ref(false)
const flashPulse = ref(false)

const isFullscreen = computed(() => props.mode === 'fullscreen')
const active = computed(() => props.open !== false)

async function startCamera() {
  cameraError.value = ''
  torchSupported.value = false
  torchOn.value = false
  if (!import.meta.client) return
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraError.value = 'Camera not available — use Gallery instead.'
    return
  }
  try {
    stopCamera()
    const media = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    })
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
    cameraError.value = 'Could not open the camera — use Gallery instead.'
  }
}

function stopCamera() {
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
  const video = videoRef.value
  const canvas = canvasRef.value
  if (!video || !canvas || !video.videoWidth) return
  busy.value = true
  flashPulse.value = true
  try {
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) return
    const file = new File([blob], `service-log-${Date.now()}.jpg`, { type: 'image/jpeg' })
    emit('captured', file)
  }
  finally {
    busy.value = false
    window.setTimeout(() => { flashPulse.value = false }, 180)
  }
}

function onFilePick(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('captured', file)
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
          <strong>Scan Service Log</strong>
          <span>Align the paper log, then tap the shutter</span>
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
        <div class="sl-doc-cam__frame" aria-hidden="true">
          <span class="c tl" />
          <span class="c tr" />
          <span class="c bl" />
          <span class="c br" />
        </div>
        <p class="sl-doc-cam__guide">Align the Service Log in the Frame</p>
      </div>

      <canvas ref="canvasRef" class="sl-doc-cam__canvas" />

      <p v-if="cameraError" class="sl-doc-cam__error">{{ cameraError }}</p>

      <div v-if="isFullscreen" class="sl-doc-cam__dock">
        <button
          type="button"
          class="sl-doc-cam__side-btn"
          @click="fileInputRef?.click()"
        >
          Gallery
        </button>
        <button
          type="button"
          class="sl-doc-cam__shutter"
          :disabled="busy || !stream"
          aria-label="Take photo"
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
        <button type="button" class="btn primary" :disabled="busy || !stream" @click="capture">
          Take Photo
        </button>
        <button type="button" class="btn" @click="fileInputRef?.click()">
          Gallery
        </button>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        accept="image/*"
        capture="environment"
        class="sl-doc-cam__file"
        @change="onFilePick"
      >
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
  display: block;
}
.sl-doc-cam__frame {
  pointer-events: none;
  position: absolute;
  inset: 10% 8%;
  border: 1.5px solid rgba(255, 255, 255, 0.55);
  border-radius: 12px;
  box-shadow: 0 0 0 999px rgba(15, 23, 42, 0.35);
}
.sl-doc-cam__frame .c {
  position: absolute;
  width: 22px;
  height: 22px;
  border: 3px solid #38bdf8;
}
.sl-doc-cam__frame .tl { top: -2px; left: -2px; border-right: 0; border-bottom: 0; border-radius: 6px 0 0 0; }
.sl-doc-cam__frame .tr { top: -2px; right: -2px; border-left: 0; border-bottom: 0; border-radius: 0 6px 0 0; }
.sl-doc-cam__frame .bl { bottom: -2px; left: -2px; border-right: 0; border-top: 0; border-radius: 0 0 0 6px; }
.sl-doc-cam__frame .br { bottom: -2px; right: -2px; border-left: 0; border-top: 0; border-radius: 0 0 6px 0; }
.sl-doc-cam__guide {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 12px;
  margin: 0;
  text-align: center;
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
}
.sl-doc-cam__canvas,
.sl-doc-cam__file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.sl-doc-cam__actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
.sl-doc-cam__actions :deep(.btn),
.sl-doc-cam__actions .btn {
  flex: 1;
  min-height: 48px;
}
.sl-doc-cam__error {
  margin: 10px 0 0;
  color: #fbbf24;
  font-size: 13px;
}

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
.sl-doc-cam--fullscreen .sl-doc-cam__frame {
  inset: 12% 8% 18%;
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
.sl-doc-cam__top-copy strong {
  font-size: 15px;
  font-weight: 800;
}
.sl-doc-cam__top-copy span {
  font-size: 12px;
  color: #cbd5e1;
}
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
.sl-doc-cam__icon-btn.on {
  background: rgba(250, 204, 21, 0.25);
  color: #fde047;
}
.sl-doc-cam__icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
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
.sl-doc-cam__side-btn.on {
  background: rgba(250, 204, 21, 0.22);
  color: #fde047;
}
.sl-doc-cam__side-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
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
.sl-doc-cam__shutter:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.sl-doc-cam__shutter:not(:disabled):active .sl-doc-cam__shutter-ring {
  transform: scale(0.94);
}
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

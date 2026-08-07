<script setup lang="ts">
/**
 * Mobile-first document capture with a framed viewfinder.
 * Falls back to file input when getUserMedia is unavailable.
 */
const emit = defineEmits<{
  captured: [file: File]
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const stream = ref<MediaStream | null>(null)
const cameraError = ref('')
const busy = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

async function startCamera() {
  cameraError.value = ''
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraError.value = 'Camera not available — use the gallery button.'
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
    await nextTick()
    if (videoRef.value) {
      videoRef.value.srcObject = media
      await videoRef.value.play().catch(() => {})
    }
  }
  catch {
    cameraError.value = 'Could not open the camera — use the gallery button.'
  }
}

function stopCamera() {
  stream.value?.getTracks().forEach(t => t.stop())
  stream.value = null
  if (videoRef.value) videoRef.value.srcObject = null
}

async function capture() {
  const video = videoRef.value
  const canvas = canvasRef.value
  if (!video || !canvas || !video.videoWidth) return
  busy.value = true
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
  }
}

function onFilePick(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('captured', file)
}

onMounted(() => { void startCamera() })
onBeforeUnmount(() => stopCamera())
</script>

<template>
  <div class="sl-doc-cam">
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
    <p v-if="cameraError" class="help" style="color:#b45309;">{{ cameraError }}</p>
    <div class="sl-doc-cam__actions">
      <button type="button" class="btn primary" :disabled="busy || !stream" @click="capture">
        Take Photo
      </button>
      <button type="button" class="btn" @click="fileInputRef?.click()">
        Gallery
      </button>
      <input
        ref="fileInputRef"
        type="file"
        accept="image/*"
        capture="environment"
        style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;"
        @change="onFilePick"
      >
    </div>
  </div>
</template>

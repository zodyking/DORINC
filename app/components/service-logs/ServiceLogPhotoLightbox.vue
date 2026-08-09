<script setup lang="ts">
/**
 * Full-bleed photo preview for service-log capture thumbs.
 */
const props = defineProps<{
  open: boolean
  url: string
  alt?: string
  label?: string
}>()

const emit = defineEmits<{
  close: []
}>()

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close')
}

watch(() => props.open, (open) => {
  if (!import.meta.client) return
  if (open) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  if (import.meta.client) window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && url"
      class="sl-photo-lightbox"
      role="dialog"
      aria-modal="true"
      :aria-label="label || 'Photo preview'"
      @click.self="emit('close')"
    >
      <button
        type="button"
        class="sl-photo-lightbox__close"
        aria-label="Close photo"
        @click="emit('close')"
      >
        ✕
      </button>
      <img class="sl-photo-lightbox__img" :src="url" :alt="alt || label || 'Service log photo'">
      <p v-if="label" class="sl-photo-lightbox__label">{{ label }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
.sl-photo-lightbox {
  position: fixed;
  inset: 0;
  z-index: 260;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding:
    max(16px, env(safe-area-inset-top))
    max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-left));
  background: rgba(2, 6, 23, 0.94);
}
.sl-photo-lightbox__close {
  position: absolute;
  top: max(12px, env(safe-area-inset-top));
  right: max(12px, env(safe-area-inset-right));
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  z-index: 1;
}
.sl-photo-lightbox__img {
  max-width: min(100%, 720px);
  max-height: min(78dvh, 900px);
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 12px;
  background: #0f172a;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
}
.sl-photo-lightbox__label {
  margin: 0;
  color: #e2e8f0;
  font-size: 14px;
  font-weight: 700;
}
</style>

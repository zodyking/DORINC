<script setup lang="ts">
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const desktop = ref(false)

function close() {
  open.value = false
}

function toggle() {
  open.value = !open.value
}

function syncDesktop() {
  desktop.value = window.matchMedia('(min-width: 768px)').matches
  if (desktop.value) open.value = false
}

function onDocumentClick(event: MouseEvent) {
  if (!open.value || desktop.value) return
  const target = event.target as Node | null
  if (root.value && target && !root.value.contains(target)) close()
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

const showPanel = computed(() => desktop.value || open.value)

onMounted(() => {
  syncDesktop()
  window.matchMedia('(min-width: 768px)').addEventListener('change', syncDesktop)
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onDocumentKeydown)
})

onUnmounted(() => {
  window.matchMedia('(min-width: 768px)').removeEventListener('change', syncDesktop)
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <div ref="root" class="page-actions" :class="{ desktop }">
    <button
      v-show="!desktop"
      type="button"
      class="iconbtn page-actions__trigger"
      aria-label="Page actions"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      ☰
    </button>
    <div
      v-show="showPanel"
      class="page-actions__panel"
      :class="{ open: showPanel }"
      role="menu"
      @click="!desktop && close()"
    >
      <slot />
    </div>
  </div>
</template>

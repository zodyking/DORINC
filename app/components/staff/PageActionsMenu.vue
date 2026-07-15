<script setup lang="ts">
const open = ref(false)
const root = ref<HTMLElement | null>(null)

function close() {
  open.value = false
}

function onPanelClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('a, button')) close()
}

function toggle() {
  open.value = !open.value
}

function onDocumentClick(event: MouseEvent) {
  if (!open.value) return
  const target = event.target as Node | null
  if (root.value && target && !root.value.contains(target)) close()
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onDocumentKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <div ref="root" class="page-actions">
    <button
      type="button"
      class="iconbtn page-actions__trigger"
      aria-label="Page actions"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      <span class="page-actions__icon" aria-hidden="true">⋮</span>
    </button>
    <div
      class="page-actions__panel"
      :class="{ open }"
      role="menu"
      @click="onPanelClick"
    >
      <slot />
    </div>
  </div>
</template>

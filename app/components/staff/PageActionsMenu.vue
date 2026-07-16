<script setup lang="ts">
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

function close() {
  open.value = false
}

function onPanelClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('a, button')) close()
}

function updatePanelPosition() {
  const el = triggerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const width = Math.min(320, Math.max(220, Math.min(92 * window.innerWidth / 100, window.innerWidth - 16)))
  let left = rect.right - width
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
  panelStyle.value = {
    position: 'fixed',
    top: `${Math.round(rect.bottom + 8)}px`,
    left: `${Math.round(left)}px`,
    width: `${Math.round(width)}px`,
    zIndex: '1200',
  }
}

function toggle() {
  open.value = !open.value
  if (open.value) {
    nextTick(() => updatePanelPosition())
  }
}

function onDocumentClick(event: MouseEvent) {
  if (!open.value) return
  const target = event.target as Node | null
  const inRoot = !!(root.value && target && root.value.contains(target))
  const inPanel = !!(panelRef.value && target && panelRef.value.contains(target))
  if (!inRoot && !inPanel) close()
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

function onWindowReposition() {
  if (open.value) updatePanelPosition()
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onDocumentKeydown)
  window.addEventListener('resize', onWindowReposition)
  window.addEventListener('scroll', onWindowReposition, true)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onDocumentKeydown)
  window.removeEventListener('resize', onWindowReposition)
  window.removeEventListener('scroll', onWindowReposition, true)
})
</script>

<template>
  <div ref="root" class="page-actions">
    <button
      ref="triggerRef"
      type="button"
      class="iconbtn page-actions__trigger"
      aria-label="Page actions"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      <span class="page-actions__icon" aria-hidden="true">⋮</span>
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        ref="panelRef"
        class="page-actions__panel open"
        :style="panelStyle"
        role="menu"
        @click="onPanelClick"
      >
        <slot />
      </div>
    </Teleport>
  </div>
</template>

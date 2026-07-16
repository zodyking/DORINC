<script setup lang="ts">
const { alertState, dismissAlert } = useAppAlert()

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && alertState.open) {
    event.preventDefault()
    dismissAlert()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="alertState.open"
      class="modal-scrim open app-alert-scrim"
      @click.self="dismissAlert"
    >
      <div
        class="modal app-alert-modal"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="alertState.title ? 'app-alert-title' : undefined"
        aria-describedby="app-alert-message"
      >
        <div class="mhead">
          <div>
            <h3 v-if="alertState.title" id="app-alert-title">{{ alertState.title }}</h3>
          </div>
          <button type="button" class="close" aria-label="Close" @click="dismissAlert">✕</button>
        </div>
        <div class="mbody">
          <p id="app-alert-message" class="app-alert-message">{{ alertState.message }}</p>
        </div>
        <div class="mfoot">
          <button type="button" class="btn primary" autofocus @click="dismissAlert">OK</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.app-alert-modal {
  width: min(420px, 100%);
}

.app-alert-message {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: #334155;
}
</style>

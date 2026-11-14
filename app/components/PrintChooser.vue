<script setup lang="ts">
/**
 * One Print action. Lists the shop printers, Staples, and this device.
 * The parent does the actual printing after a choice.
 */
const open = defineModel<boolean>('open', { default: false })

withDefaults(defineProps<{
  title?: string
  lead?: string
  showDevice?: boolean
  showStaples?: boolean
  showPrinters?: boolean
  busy?: boolean
  error?: string
}>(), {
  title: 'Print',
  lead: 'Choose where this should print.',
  showDevice: true,
  showStaples: true,
  showPrinters: true,
  busy: false,
  error: '',
})

const emit = defineEmits<{
  choose: [choice:
    | { kind: 'device' }
    | { kind: 'staples' }
    | { kind: 'printer', queue: string, label: string },
  ]
}>()

const { targets, canSend, load } = usePrintTargets()

const printers = computed(() => (canSend.value ? targets.value : []))

function close() {
  if (open.value) open.value = false
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

watch(open, (isOpen) => {
  if (isOpen) void load(true)
  if (!import.meta.client) return
  if (isOpen) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
})

onUnmounted(() => {
  if (import.meta.client) window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-scrim open" @click.self="close">
      <div class="card modal-card print-chooser" role="dialog" aria-modal="true" aria-labelledby="print-chooser-title">
        <div class="chead">
          <h3 id="print-chooser-title">{{ title }}</h3>
        </div>
        <div class="cbody">
          <p class="print-chooser__lead">{{ lead }}</p>
          <div class="print-chooser__options" role="list">
            <template v-if="showPrinters">
              <button
                v-for="printer in printers"
                :key="printer.queue"
                type="button"
                class="print-chooser__option"
                role="listitem"
                :disabled="busy"
                @click="emit('choose', { kind: 'printer', queue: printer.queue, label: printer.label })"
              >
                <span class="print-chooser__title">{{ printer.label }}</span>
                <span class="print-chooser__desc">Print on this shop printer</span>
              </button>
              <p v-if="!printers.length" class="print-chooser__empty">No shop printer is ready yet.</p>
            </template>
            <button
              v-if="showStaples"
              type="button"
              class="print-chooser__option"
              role="listitem"
              :disabled="busy"
              @click="emit('choose', { kind: 'staples' })"
            >
              <span class="print-chooser__title">Staples</span>
              <span class="print-chooser__desc">Email to Staples PrintMe and get a release code</span>
            </button>
            <button
              v-if="showDevice"
              type="button"
              class="print-chooser__option"
              role="listitem"
              :disabled="busy"
              @click="emit('choose', { kind: 'device' })"
            >
              <span class="print-chooser__title">Print From This Device</span>
              <span class="print-chooser__desc">Open the print dialog on this computer</span>
            </button>
          </div>
          <p v-if="error" class="print-chooser__error">{{ error }}</p>
          <div class="print-chooser__foot">
            <button type="button" class="btn" :disabled="busy" @click="close">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.print-chooser { max-width: 440px; width: 100%; }
.print-chooser__lead { margin: 0 0 14px; font-size: 13px; color: #64748b; }
.print-chooser__options { display: flex; flex-direction: column; gap: 8px; }
.print-chooser__option {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  width: 100%; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 12px;
  background: #fff; text-align: left; cursor: pointer;
}
.print-chooser__option:hover:not(:disabled) { border-color: #c7d2fe; background: #f8fafc; }
.print-chooser__option:disabled { opacity: .55; cursor: not-allowed; }
.print-chooser__title { font-size: 15px; font-weight: 700; color: #0f172a; }
.print-chooser__desc { font-size: 13px; color: #64748b; line-height: 1.4; }
.print-chooser__empty { margin: 0; font-size: 13px; color: #94a3b8; }
.print-chooser__error { margin: 12px 0 0; font-size: 13px; color: #dc2626; }
.print-chooser__foot { display: flex; margin-top: 14px; }
</style>

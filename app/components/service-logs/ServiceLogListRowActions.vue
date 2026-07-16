<script setup lang="ts">
import PageActionsMenu from '~/components/staff/PageActionsMenu.vue'
import type { ServiceLogStatus } from '~/utils/service-logs-ui'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

const props = defineProps<{
  logId: string
  logLabel: string
  status: ServiceLogStatus
  invoiceId: string | null
  canSendToInvoice?: boolean
  canRevertInvoice?: boolean
  busy?: boolean
}>()

const emit = defineEmits<{ changed: [], error: [message: string] }>()

const actionBusy = ref(false)
const isBusy = computed(() => props.busy || actionBusy.value)

async function sendToInvoice() {
  if (!props.canSendToInvoice || isBusy.value) return
  actionBusy.value = true
  try {
    await $fetch(`/api/service-logs/${props.logId}/convert-to-invoice`, { method: 'POST', body: {} })
    emit('changed')
  }
  catch (e: unknown) {
    emit('error', syncFetchErrorMessage(e, 'Send to invoice failed'))
  }
  finally {
    actionBusy.value = false
  }
}

async function undoSendToInvoice() {
  if (!props.canRevertInvoice || isBusy.value) return
  actionBusy.value = true
  try {
    await $fetch(`/api/service-logs/${props.logId}/revert-invoice`, { method: 'POST' })
    emit('changed')
  }
  catch (e: unknown) {
    emit('error', syncFetchErrorMessage(e, 'Undo failed'))
  }
  finally {
    actionBusy.value = false
  }
}

const showSend = computed(() => !!props.canSendToInvoice)
const showUndo = computed(() => !!props.canRevertInvoice)
const showViewInvoice = computed(() =>
  !!props.invoiceId && (props.status === 'converted_to_invoice' || showUndo.value),
)
</script>

<template>
  <div class="sl-row-actions" @click.stop>
    <PageActionsMenu>
      <button
        v-if="showSend"
        type="button"
        class="btn primary"
        :disabled="isBusy"
        @click="sendToInvoice"
      >
        {{ isBusy ? 'Sending…' : 'Send to invoice' }}
      </button>
      <button
        v-if="showUndo"
        type="button"
        class="btn"
        :disabled="isBusy"
        @click="undoSendToInvoice"
      >
        {{ isBusy ? 'Undoing…' : 'Undo send to invoice' }}
      </button>
      <NuxtLink
        v-if="showViewInvoice"
        :to="`/invoices/${invoiceId}`"
        class="btn"
      >
        View invoice
      </NuxtLink>
      <NuxtLink :to="`/service-logs/${logId}`" class="btn">
        Open log
      </NuxtLink>
    </PageActionsMenu>
  </div>
</template>

<style scoped>
.sl-row-actions {
  display: flex;
  justify-content: flex-end;
}
.sl-row-actions :deep(.page-actions__panel .btn:disabled) {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>

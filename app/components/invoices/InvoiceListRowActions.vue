<script setup lang="ts">
import PageActionsMenu from '~/components/staff/PageActionsMenu.vue'
import SendInvoiceButton from '~/components/SendInvoiceButton.vue'
import DeleteEntityButton from '~/components/DeleteEntityButton.vue'
import { isInvoiceEmailable, isInvoiceResend, type InvoiceStatus } from '~/utils/invoices-ui'

const props = defineProps<{
  invoiceId: string
  invoiceLabel: string
  status: InvoiceStatus
}>()

const emit = defineEmits<{ changed: [] }>()

const auth = useAuthStore()
const ready = computed(() => auth.loaded)

const sendRef = ref<InstanceType<typeof SendInvoiceButton> | null>(null)

const canSendPerm = computed(() => auth.can('invoices.send.all'))
const canUpdatePerm = computed(() => auth.can('invoices.update.all'))
const canDeletePerm = computed(() => auth.can('deletion_requests.submit.all'))

const isResend = computed(() => isInvoiceResend(props.status))
const sendAllowed = computed(() => canSendPerm.value && isInvoiceEmailable(props.status))
const editAllowed = computed(() => canUpdatePerm.value && props.status === 'draft')
const deleteAllowed = computed(() => canDeletePerm.value && props.status !== 'void' && props.status !== 'paid')

const sendLabel = computed(() => (isResend.value ? 'Resend' : 'Send'))

const sendTitle = computed(() => {
  if (!canSendPerm.value) return 'You do not have permission to send invoices'
  if (sendAllowed.value && isResend.value) return 'Resend invoice PDF to customer'
  if (sendAllowed.value) return 'Email invoice PDF to customer'
  if (props.status === 'void') return 'Void invoices cannot be sent'
  return 'Send is not available for this invoice'
})

const editTitle = computed(() => {
  if (!canUpdatePerm.value) return 'You do not have permission to edit invoices'
  return editAllowed.value ? 'Edit draft invoice' : 'Only draft invoices can be edited'
})

const deleteTitle = computed(() => {
  if (!canDeletePerm.value) return 'You do not have permission to request deletion'
  if (deleteAllowed.value) return 'Request permanent deletion'
  if (props.status === 'paid') return 'Paid invoices cannot be deleted'
  return 'Void invoices cannot be deleted'
})

function onSendClick() {
  if (!sendAllowed.value) return
  sendRef.value?.openModal()
}
</script>

<template>
  <div v-if="ready" class="inv-row-actions" @click.stop>
    <PageActionsMenu>
      <NuxtLink
        v-if="editAllowed"
        :to="`/invoices/${invoiceId}/edit`"
        class="btn"
        :title="editTitle"
      >
        Edit
      </NuxtLink>
      <button
        v-else
        type="button"
        class="btn"
        disabled
        :title="editTitle"
      >
        Edit
      </button>
      <button
        type="button"
        class="btn"
        :disabled="!sendAllowed"
        :title="sendTitle"
        @click="onSendClick"
      >
        {{ sendLabel }}
      </button>
      <DeleteEntityButton
        v-if="canDeletePerm"
        :entity-id="invoiceId"
        entity-type="invoice"
        :entity-label="invoiceLabel"
        menu-item
        :disabled="!deleteAllowed"
        :title="deleteTitle"
        @submitted="emit('changed')"
      />
      <button
        v-else
        type="button"
        class="btn"
        disabled
        :title="deleteTitle"
      >
        Request deletion
      </button>
    </PageActionsMenu>

    <SendInvoiceButton
      ref="sendRef"
      :invoice-id="invoiceId"
      :label="sendLabel"
      hide-trigger
      @sent="emit('changed')"
    />
  </div>
</template>

<style scoped>
.inv-row-actions {
  display: flex;
  justify-content: flex-end;
}
.inv-row-actions :deep(.page-actions__panel .btn:disabled) {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>

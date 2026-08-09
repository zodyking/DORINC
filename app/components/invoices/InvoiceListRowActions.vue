<script setup lang="ts">
import PageActionsMenu from '~/components/staff/PageActionsMenu.vue'
import SendInvoiceButton from '~/components/SendInvoiceButton.vue'
import DeleteEntityButton from '~/components/DeleteEntityButton.vue'
import { isInvoiceEditable, isInvoiceEmailable, isInvoiceResend, type InvoiceStatus } from '~/utils/invoices-ui'
import { fetchInvoicePreviewPdf } from '~/utils/invoice-pdf'
import { printPdfBlob } from '~/utils/print-pdf'
import { fetchErrorMessage, syncFetchErrorMessage } from '~/utils/fetch-blob-error'

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
const canGeneratePdf = computed(() => auth.can('invoices.generate_pdf.all') || auth.can('invoices.read.all'))
const canStaplesPrint = computed(() =>
  auth.can('staples.print.all')
  || auth.can('invoices.read.all')
  || auth.can('invoices.update.all'),
)

const isResend = computed(() => isInvoiceResend(props.status))
const sendAllowed = computed(() => canSendPerm.value && isInvoiceEmailable(props.status))
const editAllowed = computed(() => canUpdatePerm.value && isInvoiceEditable(props.status))
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
  if (props.status === 'paid') return 'Paid invoices cannot be edited'
  if (props.status === 'void') return 'Void invoices cannot be edited'
  return editAllowed.value ? 'Edit invoice' : 'This invoice cannot be edited'
})

const deleteTitle = computed(() => {
  if (!canDeletePerm.value) return 'You do not have permission to request deletion'
  if (deleteAllowed.value) return 'Request permanent deletion'
  if (props.status === 'paid') return 'Paid invoices cannot be deleted'
  return 'Void invoices cannot be deleted'
})

const printBusy = ref(false)
const staplesBusy = ref(false)
const actionError = ref('')

function onSendClick() {
  if (!sendAllowed.value) return
  sendRef.value?.openModal()
}

async function printLocal() {
  if (!canGeneratePdf.value || printBusy.value) return
  printBusy.value = true
  actionError.value = ''
  try {
    const blob = await fetchInvoicePreviewPdf(props.invoiceId)
    await printPdfBlob(blob)
    await $fetch(`/api/invoices/${props.invoiceId}/print-notify`, { method: 'POST' })
  }
  catch (e: unknown) {
    actionError.value = await fetchErrorMessage(e, 'Could not print invoice PDF')
  }
  finally {
    printBusy.value = false
  }
}

async function printViaStaples() {
  if (!canStaplesPrint.value || staplesBusy.value) return
  staplesBusy.value = true
  actionError.value = ''
  try {
    const res = await $fetch<{ job: { id: string, status: string, errorMessage: string | null } }>(
      `/api/invoices/${props.invoiceId}/staples-print`,
      { method: 'POST' },
    )
    if (res.job.status === 'failed') {
      actionError.value = res.job.errorMessage || 'Could not email Staples PrintMe'
      return
    }
    await navigateTo('/staples')
  }
  catch (e: unknown) {
    actionError.value = syncFetchErrorMessage(e, 'Could not start Staples PrintMe')
  }
  finally {
    staplesBusy.value = false
  }
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
      <button
        v-if="canGeneratePdf"
        type="button"
        class="btn"
        :disabled="printBusy"
        title="Print invoice PDF on this device"
        @click="printLocal"
      >
        {{ printBusy ? 'Printing…' : 'Print' }}
      </button>
      <button
        v-if="canStaplesPrint"
        type="button"
        class="btn"
        :disabled="staplesBusy"
        title="Send invoice PDF to Staples PrintMe"
        @click="printViaStaples"
      >
        {{ staplesBusy ? 'Sending…' : 'Print via Staples' }}
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

    <p v-if="actionError" class="inv-row-actions__err">{{ actionError }}</p>

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
  flex-wrap: wrap;
}
.inv-row-actions :deep(.page-actions__panel .btn:disabled) {
  opacity: 0.55;
  cursor: not-allowed;
}
.inv-row-actions__err {
  flex-basis: 100%;
  margin: 6px 0 0;
  font-size: 12px;
  color: #dc2626;
  text-align: right;
}
</style>

<script setup lang="ts">
import { dueDateFromTerms } from '~/utils/invoice-creator-ui'
import { invoiceDateDisplay, paymentTermsLabel } from '~/utils/invoices-ui'

const props = withDefaults(defineProps<{
  invoiceId: string
  invoiceDate: string
  dueDate?: string | null
  paymentTerms?: string | null
  buttonClass?: string
  disabled?: boolean
}>(), {
  dueDate: null,
  paymentTerms: null,
  buttonClass: 'btn',
  disabled: false,
})

const emit = defineEmits<{ changed: [] }>()

const auth = useAuthStore()
const canChange = computed(() => auth.loaded && auth.can('invoices.update.all'))

const open = ref(false)
const invoiceDate = ref('')
const dueDate = ref('')
const reason = ref('')
const busy = ref(false)
const error = ref('')

const dueBeforeInvoice = computed(() =>
  !!invoiceDate.value && !!dueDate.value && dueDate.value < invoiceDate.value,
)

const canSuggestFromTerms = computed(() => !!props.paymentTerms && !!invoiceDate.value)

function openModal() {
  error.value = ''
  reason.value = ''
  invoiceDate.value = props.invoiceDate
  dueDate.value = props.dueDate ?? ''
  open.value = true
}

function applyTerms() {
  if (!canSuggestFromTerms.value) return
  dueDate.value = dueDateFromTerms(invoiceDate.value, props.paymentTerms!)
}

async function submit() {
  if (!invoiceDate.value) {
    error.value = 'Enter an invoice date.'
    return
  }
  if (dueBeforeInvoice.value) {
    error.value = 'Due date cannot be before the invoice date.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/invoices/${props.invoiceId}/dates`, {
      method: 'POST',
      body: {
        invoiceDate: invoiceDate.value,
        dueDate: dueDate.value || null,
        reason: reason.value.trim() || undefined,
      },
    })
    open.value = false
    emit('changed')
  }
  catch (e: unknown) {
    const err = e as { data?: { message?: string, data?: { message?: string } } }
    error.value = err.data?.data?.message ?? err.data?.message ?? 'Could not update the invoice dates'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <button
    v-if="canChange"
    type="button"
    :class="buttonClass"
    :disabled="disabled || busy"
    @click.stop="openModal"
  >
    Change dates
  </button>

  <Teleport to="body">
    <div v-if="open" class="modal-scrim open" @click.self="open = false">
      <div class="card modal-card" style="max-width:480px; width:100%;">
        <div class="chead"><h3>Change invoice dates</h3></div>
        <div class="cbody">
          <label class="fld">
            Invoice date
            <input v-model="invoiceDate" type="date">
          </label>

          <label class="fld">
            Due date
            <input v-model="dueDate" type="date" :min="invoiceDate || undefined">
            <span class="help" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span v-if="dueDate">Due {{ invoiceDateDisplay(dueDate) }}</span>
              <span v-else>No explicit due date — payment terms apply.</span>
              <button
                v-if="canSuggestFromTerms"
                type="button"
                class="btn ghost sm"
                @click="applyTerms"
              >
                Use {{ paymentTermsLabel(paymentTerms) }}
              </button>
            </span>
          </label>

          <label class="fld">
            Reason (optional)
            <textarea v-model="reason" rows="2" placeholder="Why are the dates changing?" />
          </label>

          <p v-if="dueBeforeInvoice" class="help" style="color:#dc2626;">Due date cannot be before the invoice date.</p>
          <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>
          <div style="display:flex; gap:8px; margin-top:12px;">
            <button type="button" class="btn primary" :disabled="busy || dueBeforeInvoice" @click="submit">
              {{ busy ? 'Saving…' : 'Save dates' }}
            </button>
            <button type="button" class="btn" :disabled="busy" @click="open = false">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

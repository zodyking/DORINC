<script setup lang="ts">
const props = defineProps<{
  invoiceId: string
  invoiceLabel: string
  status: InvoiceStatus
  disabled?: boolean
}>()

const emit = defineEmits<{ voided: [] }>()

const auth = useAuthStore()
const canVoid = computed(() =>
  auth.can('invoices.void.all') && auth.can('deletion_requests.review.all'),
)

const removable = computed(() =>
  props.status !== 'void' && props.status !== 'paid',
)

const modalOpen = ref(false)
const busy = ref(false)
const error = ref('')

async function confirmVoid() {
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/invoices/${props.invoiceId}/void`, { method: 'POST' })
    modalOpen.value = false
    emit('voided')
  }
  catch (e: unknown) {
    const err = e as { data?: { message?: string, data?: { message?: string } } }
    error.value = err.data?.data?.message ?? err.data?.message ?? 'Could not void invoice'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <button
    v-if="canVoid && removable"
    type="button"
    class="btn danger"
    :disabled="disabled || busy"
    @click="modalOpen = true"
  >
    Void invoice
  </button>

  <div v-if="modalOpen" class="modal-scrim open" @click.self="modalOpen = false">
    <div class="card modal-card" style="max-width:480px; width:100%;">
      <div class="chead">
        <h3>Void invoice</h3>
        <span class="pill over">Permanent status change</span>
      </div>
      <div class="cbody">
        <p style="font-size:13px; color:#64748b; margin:0 0 14px;">
          Void <strong>{{ invoiceLabel }}</strong>? The invoice stays in the system with a voided status — it is not erased.
          Paid invoices cannot be voided.
        </p>
        <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button type="button" class="btn danger" :disabled="busy" @click="confirmVoid">
            {{ busy ? 'Voiding…' : 'Void invoice' }}
          </button>
          <button type="button" class="btn" :disabled="busy" @click="modalOpen = false">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { moneyDisplay, invoiceDateDisplay } from '~/utils/invoices-ui'

const props = withDefaults(defineProps<{
  invoiceId: string
  buttonClass?: string
  label?: string
  disabled?: boolean
  hideTrigger?: boolean
}>(), {
  buttonClass: 'btn primary',
  label: 'Send invoice',
  disabled: false,
  hideTrigger: false,
})

const emit = defineEmits<{ sent: [] }>()

const auth = useAuthStore()
const canSend = computed(() => auth.loaded && auth.can('invoices.send.all'))

interface SendPreview {
  invoiceNumber: string
  status: string
  total: string
  dueDate: string | null
  recipient: { email: string, name: string } | null
  subject: string
  message: string
  notificationEnabled: boolean
  alreadyQueued: boolean
  sendable: boolean
}

type Phase = 'compose' | 'sending' | 'sent' | 'failed'

const open = ref(false)
const phase = ref<Phase>('compose')
const loadingPreview = ref(false)
const busy = ref(false)
const error = ref('')

const preview = ref<SendPreview | null>(null)
const recipientEmail = ref('')
const subject = ref('')
const message = ref('')
const resultMessage = ref('')

let pollTimer: ReturnType<typeof setInterval> | undefined

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = undefined
  }
}

async function openModal() {
  open.value = true
  phase.value = 'compose'
  error.value = ''
  resultMessage.value = ''
  preview.value = null
  loadingPreview.value = true
  try {
    const data = await $fetch<SendPreview>(`/api/invoices/${props.invoiceId}/send-preview`)
    preview.value = data
    recipientEmail.value = data.recipient?.email ?? ''
    subject.value = data.subject
    message.value = data.message
    if (data.alreadyQueued) {
      phase.value = 'sending'
      startPolling()
    }
  }
  catch (e: unknown) {
    error.value = readErr(e, 'Could not load the send preview')
  }
  finally {
    loadingPreview.value = false
  }
}

function closeModal() {
  stopPolling()
  open.value = false
}

function readErr(e: unknown, fallback: string) {
  const err = e as { data?: { message?: string, data?: { message?: string } } }
  return err.data?.data?.message ?? err.data?.message ?? fallback
}

async function submit() {
  if (!recipientEmail.value.trim()) {
    error.value = 'Enter a recipient email address.'
    return
  }
  if (!subject.value.trim()) {
    error.value = 'Enter a subject line.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/invoices/${props.invoiceId}/send`, {
      method: 'POST',
      body: {
        recipientEmail: recipientEmail.value.trim(),
        subject: subject.value.trim(),
        message: message.value.trim() || undefined,
      },
    })
    phase.value = 'sending'
    startPolling()
  }
  catch (e: unknown) {
    error.value = readErr(e, 'Could not queue the invoice for sending')
  }
  finally {
    busy.value = false
  }
}

function startPolling() {
  stopPolling()
  void pollStatus()
  pollTimer = setInterval(() => { void pollStatus() }, 4000)
}

async function pollStatus() {
  try {
    const data = await $fetch<{
      status: string
      delivery: { status: string, lastError: string | null, recipientEmail: string | null } | null
    }>(`/api/invoices/${props.invoiceId}/send-status`)

    if (data.status === 'sent' || data.status === 'paid' || data.delivery?.status === 'done') {
      stopPolling()
      phase.value = 'sent'
      resultMessage.value = `Invoice sent to ${data.delivery?.recipientEmail ?? recipientEmail.value}.`
      emit('sent')
      return
    }
    if (data.delivery?.status === 'failed') {
      stopPolling()
      phase.value = 'failed'
      resultMessage.value = data.delivery.lastError
        ? `Delivery failed: ${data.delivery.lastError}`
        : 'Delivery failed. Check the mail worker and try again.'
    }
  }
  catch {
    // Transient poll error — keep polling.
  }
}

function retry() {
  phase.value = 'compose'
  error.value = ''
  resultMessage.value = ''
}

onUnmounted(stopPolling)

defineExpose({ openModal })
</script>

<template>
  <button
    v-if="canSend && !hideTrigger"
    type="button"
    :class="buttonClass"
    :disabled="disabled || busy"
    @click="openModal"
  >
    {{ label }}
  </button>

  <Teleport to="body">
    <div v-if="open" class="modal-scrim open" @click.self="closeModal">
      <div class="card modal-card" style="max-width:560px; width:100%;">
        <div class="chead">
          <h3>Send invoice{{ preview ? ` ${preview.invoiceNumber}` : '' }}</h3>
        </div>
        <div class="cbody">
          <div v-if="loadingPreview" class="cp-state">Loading…</div>

          <template v-else-if="phase === 'compose'">
            <p v-if="preview && !preview.notificationEnabled" class="flash" style="background:#fef2f2; color:#b91c1c; margin:0 0 14px;">
              Invoice emails are disabled in Control Panel → Notifications. Enable them to send.
            </p>
            <p v-else style="font-size:13px; color:#64748b; margin:0 0 14px;">
              A PDF of this invoice will be attached. Review the recipient and message below.
            </p>

            <label class="fld">
              To
              <input v-model="recipientEmail" type="email" placeholder="billing@customer.com" autocomplete="off">
              <span v-if="preview && !preview.recipient" class="help" style="color:#b45309;">
                No billing email on file — enter one to send.
              </span>
            </label>

            <label class="fld">
              Subject
              <input v-model="subject" type="text" maxlength="300">
            </label>

            <label class="fld">
              Message
              <textarea v-model="message" rows="4" maxlength="5000" />
              <span class="help">Due date, total, portal link and footer are added automatically.</span>
            </label>

            <div v-if="preview" class="inv-send-meta">
              <span>Total <b>{{ moneyDisplay(preview.total) }}</b></span>
              <span v-if="preview.dueDate">Due <b>{{ invoiceDateDisplay(preview.dueDate) }}</b></span>
            </div>

            <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>
            <div style="display:flex; gap:8px; margin-top:12px;">
              <button
                type="button"
                class="btn primary"
                :disabled="busy || (preview ? !preview.notificationEnabled || !preview.sendable : true)"
                @click="submit"
              >
                {{ busy ? 'Sending…' : 'Send invoice' }}
              </button>
              <button type="button" class="btn" :disabled="busy" @click="closeModal">Cancel</button>
            </div>
          </template>

          <template v-else-if="phase === 'sending'">
            <div class="send-status">
              <div class="spinner" aria-hidden="true" />
              <p style="margin:0; font-weight:600;">Delivering invoice…</p>
              <p class="help" style="margin:6px 0 0;">
                Generating the PDF and emailing {{ recipientEmail }}. This can take a few seconds.
              </p>
            </div>
            <div style="display:flex; gap:8px; margin-top:16px;">
              <button type="button" class="btn" @click="closeModal">Close</button>
            </div>
          </template>

          <template v-else-if="phase === 'sent'">
            <div class="send-status">
              <div class="send-badge ok" aria-hidden="true">✓</div>
              <p style="margin:0; font-weight:600;">Invoice sent</p>
              <p class="help" style="margin:6px 0 0;">{{ resultMessage }}</p>
            </div>
            <div style="display:flex; gap:8px; margin-top:16px;">
              <button type="button" class="btn primary" @click="closeModal">Done</button>
            </div>
          </template>

          <template v-else>
            <div class="send-status">
              <div class="send-badge err" aria-hidden="true">!</div>
              <p style="margin:0; font-weight:600;">Delivery failed</p>
              <p class="help" style="margin:6px 0 0; color:#dc2626;">{{ resultMessage }}</p>
            </div>
            <div style="display:flex; gap:8px; margin-top:16px;">
              <button type="button" class="btn primary" @click="retry">Try again</button>
              <button type="button" class="btn" @click="closeModal">Close</button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.inv-send-meta {
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: #475569;
  padding: 10px 0 2px;
}
.send-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 22px 8px 8px;
}
.send-badge {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 12px;
}
.send-badge.ok { background: #dcfce7; color: #16a34a; }
.send-badge.err { background: #fee2e2; color: #dc2626; }
.spinner {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid #e2e8f0;
  border-top-color: #4f46e5;
  animation: send-spin 0.8s linear infinite;
  margin-bottom: 12px;
}
@keyframes send-spin {
  to { transform: rotate(360deg); }
}
</style>

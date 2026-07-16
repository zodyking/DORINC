<script setup lang="ts">
import { isSavedPasswordMask, passwordForSave, SAVED_PASSWORD_MASK } from '~/utils/settings-credentials'

const emit = defineEmits<{ saved: [] }>()

interface ImapView {
  configured: boolean
  hasPassword?: boolean
  host: string
  port: number
  username: string
  mailbox: string
  useTls: boolean
  envLocked: boolean
  filters: {
    companyEmail: string
    additionalEmails: string[]
    includeCustomerEmails: boolean
    autoResponder: {
      enabled: boolean
      subject: string
      message: string
    }
  }
}

const { data: imapData, refresh } = useClientFetch<ImapView>('/api/admin/system/imap-settings')

const form = reactive({
  host: '',
  port: 993,
  username: '',
  password: '',
  mailbox: 'INBOX',
  useTls: true,
  companyEmail: '',
  additionalEmailsText: '',
  includeCustomerEmails: true,
  autoResponderEnabled: false,
  autoResponderSubject: 'We received your message',
  autoResponderMessage: 'Thanks for contacting us. We received your email and a team member will reply shortly during business hours.',
})

function hydrateForm(s: ImapView) {
  form.host = s.host
  form.port = s.port
  form.username = s.username
  form.mailbox = s.mailbox
  form.useTls = s.useTls
  form.companyEmail = s.filters.companyEmail
  form.additionalEmailsText = s.filters.additionalEmails.join('\n')
  form.includeCustomerEmails = s.filters.includeCustomerEmails
  form.autoResponderEnabled = s.filters.autoResponder.enabled
  form.autoResponderSubject = s.filters.autoResponder.subject
  form.autoResponderMessage = s.filters.autoResponder.message
  form.password = s.hasPassword ? SAVED_PASSWORD_MASK : ''
}

watch(() => imapData.value, (s) => {
  if (!s) return
  hydrateForm(s)
}, { immediate: true })

const saveBusy = ref(false)
const testBusy = ref(false)
const syncBusy = ref(false)
const message = ref('')
const error = ref('')

function parseAdditionalEmails(): string[] {
  return form.additionalEmailsText
    .split(/[\n,;]+/)
    .map(e => e.trim())
    .filter(Boolean)
}

async function save() {
  saveBusy.value = true
  message.value = ''
  error.value = ''
  try {
    const body: Record<string, unknown> = {
      host: form.host.trim(),
      port: form.port,
      username: form.username.trim(),
      mailbox: form.mailbox.trim() || 'INBOX',
      useTls: form.useTls,
      filters: {
        companyEmail: form.companyEmail.trim(),
        additionalEmails: parseAdditionalEmails(),
        includeCustomerEmails: form.includeCustomerEmails,
        autoResponder: {
          enabled: form.autoResponderEnabled,
          subject: form.autoResponderSubject.trim(),
          message: form.autoResponderMessage.trim(),
        },
      },
    }
    const nextPassword = passwordForSave(form.password, !!imapData.value?.hasPassword)
    if (nextPassword !== undefined) body.password = nextPassword
    await $fetch('/api/admin/system/imap-settings', { method: 'PATCH', body })
    if (imapData.value?.hasPassword || nextPassword) {
      form.password = SAVED_PASSWORD_MASK
    }
    else {
      form.password = ''
    }
    message.value = 'IMAP settings saved'
    await refresh()
    emit('saved')
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Save failed'
  }
  finally {
    saveBusy.value = false
  }
}

async function runTest() {
  testBusy.value = true
  message.value = ''
  error.value = ''
  try {
    const res = await $fetch<{ message: string }>('/api/admin/system/imap-test', { method: 'POST' })
    message.value = res.message
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'IMAP test failed'
  }
  finally {
    testBusy.value = false
  }
}

async function runSync() {
  syncBusy.value = true
  message.value = ''
  error.value = ''
  try {
    const res = await $fetch<{ message: string }>('/api/admin/system/imap-sync', { method: 'POST' })
    message.value = res.message
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'IMAP sync failed'
  }
  finally {
    syncBusy.value = false
  }
}
</script>

<template>
  <div class="settings-panel" style="margin-top:24px;">
    <header class="settings-panel-head">
      <h3>Email inbox (IMAP)</h3>
      <p>
        Connect your company Gmail (or other IMAP mailbox) to sync customer email threads into Messages.
        Uses the same SMTP settings above for outbound replies.
      </p>
    </header>

    <form class="card" @submit.prevent="save">
      <div class="cbody settings-form">
        <p v-if="imapData?.envLocked" class="settings-help" style="padding:10px 12px;background:#fffbeb;border-radius:8px;border:1px solid #fde68a;">
          IMAP is locked by server environment variables on this host.
        </p>

        <div class="row2">
          <label class="fld">
            IMAP host
            <input v-model="form.host" type="text" required maxlength="200" placeholder="imap.gmail.com" :disabled="imapData?.envLocked">
          </label>
          <label class="fld">
            Port
            <input v-model.number="form.port" type="number" min="1" max="65535" :disabled="imapData?.envLocked">
          </label>
        </div>
        <label class="fld">
          Username
          <input v-model="form.username" type="text" required maxlength="200" placeholder="accounting@yourdomain.com" :disabled="imapData?.envLocked">
        </label>
        <label class="fld">
          Password
          <input
            v-model="form.password"
            type="password"
            maxlength="500"
            :placeholder="imapData?.hasPassword ? 'Saved — leave as-is to keep current password' : 'App password'"
            :disabled="imapData?.envLocked"
            autocomplete="off"
          >
          <span v-if="imapData?.hasPassword && isSavedPasswordMask(form.password)" class="help">App password is saved. Replace only if you want to change it.</span>
        </label>
        <div class="row2">
          <label class="fld">
            Mailbox
            <input v-model="form.mailbox" type="text" maxlength="200" placeholder="INBOX" :disabled="imapData?.envLocked">
          </label>
          <label class="fld" style="display:flex;align-items:flex-end;gap:8px;padding-bottom:4px;">
            <input id="imap-use-tls" v-model="form.useTls" type="checkbox" :disabled="imapData?.envLocked">
            <span>Use TLS (recommended)</span>
          </label>
        </div>

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">

        <h4 style="margin:0 0 8px;font-size:14px;">Message filtering</h4>
        <p class="settings-help" style="margin:0 0 12px;">
          Only imports mail sent <b>from a customer email</b> to your company inbox addresses below.
          Google alerts, newsletters, and other senders are skipped automatically.
        </p>

        <label class="fld">
          Company email
          <input v-model="form.companyEmail" type="email" required maxlength="255" placeholder="accounting@yourdomain.com">
        </label>
        <label class="fld">
          Additional emails (one per line)
          <textarea
            v-model="form.additionalEmailsText"
            rows="3"
            maxlength="2000"
            placeholder="sales@yourdomain.com&#10;support@yourdomain.com"
          />
        </label>
        <label class="fld" style="display:flex;align-items:center;gap:8px;">
          <input id="imap-include-customers" v-model="form.includeCustomerEmails" type="checkbox">
          <span>Include all customer and contact email addresses in filter</span>
        </label>

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">

        <h4 style="margin:0 0 8px;font-size:14px;">Customer auto-responder</h4>
        <p class="settings-help" style="margin:0 0 12px;">
          Automatically send a branded confirmation when a <b>new</b> customer email thread arrives
          (matching the filter above). Replies in existing threads are not auto-answered.
        </p>
        <label class="fld" style="display:flex;align-items:center;gap:8px;">
          <input id="imap-auto-responder" v-model="form.autoResponderEnabled" type="checkbox">
          <span>Enable customer auto-responder</span>
        </label>
        <label class="fld">
          Auto-responder subject
          <input
            v-model="form.autoResponderSubject"
            type="text"
            maxlength="200"
            placeholder="We received your message"
            :disabled="!form.autoResponderEnabled"
          >
        </label>
        <label class="fld">
          Auto-responder message
          <textarea
            v-model="form.autoResponderMessage"
            rows="5"
            maxlength="5000"
            placeholder="Thanks for contacting us…"
            :disabled="!form.autoResponderEnabled"
          />
        </label>

        <p v-if="message" class="settings-ok">{{ message }}</p>
        <p v-if="error" class="settings-err">{{ error }}</p>

        <div class="settings-actions">
          <button type="submit" class="btn primary" :disabled="saveBusy || imapData?.envLocked">
            {{ saveBusy ? 'Saving…' : 'Save IMAP settings' }}
          </button>
        </div>
      </div>
    </form>

    <div class="card" style="margin-top:16px;">
      <div class="chead"><h3>Connection &amp; sync</h3></div>
      <div class="cbody settings-form">
        <p class="settings-help">
          Test the IMAP connection, then sync now to pull matching messages into shared email threads.
          The worker also syncs automatically every few minutes when configured.
        </p>
        <div class="settings-actions" style="gap:8px;">
          <button type="button" class="btn" :disabled="testBusy" @click="runTest">
            {{ testBusy ? 'Testing…' : 'Test IMAP connection' }}
          </button>
          <button type="button" class="btn" :disabled="syncBusy" @click="runSync">
            {{ syncBusy ? 'Syncing…' : 'Sync inbox now' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import './settings-panel.css';
</style>

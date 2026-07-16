<script setup lang="ts">
import { formatSmtpFromHeader, parseSmtpFromHeader } from '#shared/format/smtp-from'
import { isSavedPasswordMask, passwordForSave, SAVED_PASSWORD_MASK } from '~/utils/settings-credentials'

const emit = defineEmits<{ saved: [] }>()

interface SmtpView {
  configured: boolean
  hasPassword?: boolean
  host: string
  port: number
  username: string
  from: string
  fromName: string
  fromAddress: string
  envLocked: boolean
}

const { data: smtpData, refresh } = useClientFetch<SmtpView>('/api/admin/system/smtp-settings')

const form = reactive({
  host: '',
  port: 587,
  username: '',
  password: '',
  fromName: '',
  fromAddress: '',
})

function hydrateForm(s: SmtpView) {
  form.host = s.host
  form.port = s.port
  form.username = s.username
  form.fromName = s.fromName || parseSmtpFromHeader(s.from).fromName
  form.fromAddress = s.fromAddress || parseSmtpFromHeader(s.from).fromAddress
  form.password = s.hasPassword ? SAVED_PASSWORD_MASK : ''
}

watch(() => smtpData.value, (s) => {
  if (!s) return
  hydrateForm(s)
}, { immediate: true })

const fromPreview = computed(() =>
  formatSmtpFromHeader(form.fromName, form.fromAddress)
  || 'Your Shop <notifications@yourdomain.com>',
)

const auth = useAuthStore()
const smtpTestTo = ref('')
watch(() => auth.user?.email, (email) => {
  if (email && !smtpTestTo.value) smtpTestTo.value = email
}, { immediate: true })

const saveBusy = ref(false)
const testBusy = ref(false)
const message = ref('')
const error = ref('')

async function save() {
  saveBusy.value = true
  message.value = ''
  error.value = ''
  try {
    const body: Record<string, unknown> = {
      host: form.host.trim(),
      port: form.port,
      username: form.username.trim(),
      fromName: form.fromName.trim(),
      fromAddress: form.fromAddress.trim(),
    }
    const nextPassword = passwordForSave(form.password, !!smtpData.value?.hasPassword)
    if (nextPassword !== undefined) body.password = nextPassword
    await $fetch('/api/admin/system/smtp-settings', { method: 'PATCH', body })
    if (smtpData.value?.hasPassword || nextPassword) {
      form.password = SAVED_PASSWORD_MASK
    }
    else {
      form.password = ''
    }
    message.value = 'SMTP settings saved'
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
    const res = await $fetch<{ message: string }>('/api/admin/system/smtp-test', {
      method: 'POST',
      body: { to: smtpTestTo.value.trim() || undefined },
    })
    message.value = res.message
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'SMTP test failed'
  }
  finally {
    testBusy.value = false
  }
}
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel-head">
      <h3>Email (SMTP)</h3>
      <p>Outbound mail for invoices, portal notifications, and system alerts. Credentials are encrypted in PostgreSQL.</p>
    </header>

    <form class="card" @submit.prevent="save">
      <div class="cbody settings-form">
        <p v-if="smtpData?.envLocked" class="settings-help" style="padding:10px 12px;background:#fffbeb;border-radius:8px;border:1px solid #fde68a;">
          SMTP is locked by server environment variables on this host. UI changes may not apply until env vars are removed.
        </p>

        <div class="row2">
          <label class="fld">
            SMTP host
            <input v-model="form.host" type="text" required maxlength="255" placeholder="smtp.gmail.com" :disabled="smtpData?.envLocked">
          </label>
          <label class="fld">
            Port
            <input v-model.number="form.port" type="number" min="1" max="65535" :disabled="smtpData?.envLocked">
          </label>
        </div>
        <label class="fld">
          Username
          <input v-model="form.username" type="text" maxlength="255" placeholder="notifications@yourdomain.com" :disabled="smtpData?.envLocked">
        </label>
        <label class="fld">
          Password
          <input v-model="form.password" type="password" maxlength="500" :placeholder="smtpData?.hasPassword ? 'Saved — leave as-is to keep current password' : 'App password'" :disabled="smtpData?.envLocked" autocomplete="off">
          <span v-if="smtpData?.hasPassword && isSavedPasswordMask(form.password)" class="help">App password is saved. Replace only if you want to change it.</span>
        </label>
        <div class="row2">
          <label class="fld">
            From name
            <input v-model="form.fromName" type="text" maxlength="120" placeholder="Devon Onsite Repairs Inc" :disabled="smtpData?.envLocked">
          </label>
          <label class="fld">
            From address
            <input v-model="form.fromAddress" type="email" required maxlength="255" placeholder="accounting@yourdomain.com" :disabled="smtpData?.envLocked">
          </label>
        </div>
        <span class="help" style="display:block;margin:-6px 0 12px;">
          Shown in inboxes as: {{ fromPreview }}
        </span>

        <p v-if="message" class="settings-ok">{{ message }}</p>
        <p v-if="error" class="settings-err">{{ error }}</p>

        <div class="settings-actions">
          <button type="submit" class="btn primary" :disabled="saveBusy || smtpData?.envLocked">
            {{ saveBusy ? 'Saving…' : 'Save SMTP settings' }}
          </button>
        </div>
      </div>
    </form>

    <div class="card" style="margin-top:16px;">
      <div class="chead"><h3>Send test email</h3></div>
      <div class="cbody settings-form">
        <label class="fld">
          Send test to
          <input v-model="smtpTestTo" type="email" placeholder="you@example.com">
        </label>
        <button type="button" class="btn" :disabled="testBusy" @click="runTest">
          {{ testBusy ? 'Sending…' : 'Send test email' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import './settings-panel.css';
</style>

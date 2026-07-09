<script setup lang="ts">
definePageMeta({ layout: false })

const steps = ['Welcome', 'Database', 'Security', 'Email', 'PDF', 'Backup', 'AI', 'Admin'] as const

const step = ref(1)
const done = ref(false)
const busy = ref(false)
const error = ref('')
const stepMessage = ref('')
const locked = ref(false)

const { data: setupStatus, refresh: refreshStatus } = await useFetch<{
  needsBootstrap: boolean
  progress: { database: boolean, smtp: boolean, security: boolean, ai: boolean }
  envLocked: { security: boolean, smtp: boolean }
}>('/api/setup/status')

if (setupStatus.value && !setupStatus.value.needsBootstrap) {
  locked.value = true
}

const db = reactive({
  host: 'localhost',
  port: 5432,
  database: 'dorinc',
  username: 'postgres',
  password: '',
  tested: false,
  message: '',
})
const smtp = reactive({ host: '', port: 587, username: '', password: '', from: '', tested: false })
const security = reactive({ masterKey: '', sessionSecret: '', appUrl: '', saved: false })
const pdf = reactive({ serviceUrl: 'http://localhost:3100/pdf', template: 'Professional Bill Matrix v1' })
const ai = reactive({ apiKey: '', model: 'anthropic/claude-sonnet-4', saved: false })
const admin = reactive({ name: '', email: '', password: '', confirm: '', sendVerification: true })

const reveal = reactive<Record<string, boolean>>({})

if (import.meta.client && !security.appUrl) {
  security.appUrl = window.location.origin
}

function generateKey() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  security.masterKey = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  const bytes2 = new Uint8Array(32)
  crypto.getRandomValues(bytes2)
  security.sessionSecret = Array.from(bytes2, b => b.toString(16).padStart(2, '0')).join('')
}

if (!security.masterKey) generateKey()

function back() {
  if (step.value > 1) step.value -= 1
}

async function saveDatabase() {
  busy.value = true
  error.value = ''
  stepMessage.value = ''
  try {
    const res = await $fetch<{ ok: boolean, message: string }>('/api/setup/database', {
      method: 'POST',
      body: {
        host: db.host,
        port: db.port,
        database: db.database,
        username: db.username,
        password: db.password,
      },
    })
    db.tested = true
    db.message = res.message
    stepMessage.value = res.message
    await refreshStatus()
    return true
  }
  catch (err) {
    error.value = (err as { data?: { message?: string } })?.data?.message ?? 'Database setup failed'
    db.tested = false
    return false
  }
  finally {
    busy.value = false
  }
}

async function saveSecurity() {
  busy.value = true
  error.value = ''
  stepMessage.value = ''
  try {
    if (!security.masterKey || security.masterKey.length !== 64) generateKey()
    if (!security.sessionSecret) generateKey()
    await $fetch('/api/setup/security', {
      method: 'POST',
      body: {
        masterKeyHex: security.masterKey,
        sessionSecretHex: security.sessionSecret,
        appUrl: security.appUrl,
      },
    })
    security.saved = true
    stepMessage.value = 'Security settings saved'
    await refreshStatus()
    return true
  }
  catch (err) {
    error.value = (err as { data?: { message?: string } })?.data?.message ?? 'Failed to save security settings'
    return false
  }
  finally {
    busy.value = false
  }
}

async function saveSmtp(test = false) {
  busy.value = true
  error.value = ''
  stepMessage.value = ''
  try {
    const body = {
      host: smtp.host,
      port: smtp.port,
      username: smtp.username,
      password: smtp.password,
      from: smtp.from,
      to: admin.email || smtp.from,
    }
    const res = test
      ? await $fetch<{ message: string }>('/api/setup/smtp-test', { method: 'POST', body })
      : await $fetch<{ message: string }>('/api/setup/smtp', { method: 'POST', body })
    smtp.tested = true
    stepMessage.value = res.message
    await refreshStatus()
    return true
  }
  catch (err) {
    error.value = (err as { data?: { message?: string } })?.data?.message ?? 'Failed to save SMTP settings'
    return false
  }
  finally {
    busy.value = false
  }
}

async function saveAi() {
  if (!ai.apiKey.trim()) return true
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/setup/ai', {
      method: 'POST',
      body: { apiKey: ai.apiKey, defaultModel: ai.model },
    })
    ai.saved = true
    await refreshStatus()
    return true
  }
  catch (err) {
    error.value = (err as { data?: { message?: string } })?.data?.message ?? 'Failed to save AI settings'
    return false
  }
  finally {
    busy.value = false
  }
}

async function saveCurrentStep(): Promise<boolean> {
  if (step.value === 2) return saveDatabase()
  if (step.value === 3) return saveSecurity()
  if (step.value === 4) return saveSmtp(false)
  if (step.value === 7) return saveAi()
  return true
}

async function next() {
  error.value = ''
  stepMessage.value = ''

  if (step.value < steps.length) {
    const ok = await saveCurrentStep()
    if (!ok) return
    step.value += 1
    return
  }

  if (admin.password !== admin.confirm) {
    error.value = 'Passwords do not match'
    return
  }

  busy.value = true
  try {
    const okSecurity = setupStatus.value?.progress.security || setupStatus.value?.envLocked.security
      ? true
      : await saveSecurity()
    const okSmtp = setupStatus.value?.progress.smtp || setupStatus.value?.envLocked.smtp
      ? true
      : await saveSmtp(false)
    if (!okSecurity || !okSmtp) return

    await $fetch('/api/setup/bootstrap', {
      method: 'POST',
      body: { name: admin.name, email: admin.email, password: admin.password },
    })
    done.value = true
  }
  catch (err) {
    error.value = (err as { data?: { message?: string } })?.data?.message ?? 'Bootstrap failed — check the fields and try again'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="setup-scrim open" role="dialog" aria-label="Server setup wizard">
    <header class="setup-top">
      <div class="logo"><img class="sq" src="/images/dorinc-icon.png" alt="" width="30" height="30"> DORINC Suite</div>
      <span class="sp" />
      <span class="pill indigo">First-run setup</span>
    </header>

    <div v-if="locked" class="setup-body">
      <div class="card" style="text-align:center; padding:32px 24px;">
        <div style="font-size:48px; margin-bottom:12px;">🔒</div>
        <h3 style="margin:0 0 8px;">Setup is locked</h3>
        <p style="color:#64748b; margin:0 0 20px;">
          A Super Admin already exists. Sign in to manage the system from the Control Panel.
        </p>
        <NuxtLink to="/auth/login?card=staff" class="btn primary">Go to sign in</NuxtLink>
      </div>
    </div>

    <div v-else class="setup-body">
      <h2 style="margin:0 0 6px; font-size:22px;">Server setup walkthrough</h2>
      <p style="margin:0 0 18px; color:#64748b; font-size:14px;">
        Configure everything from the UI — only the database connection string is required on the server.
        Secrets are encrypted and stored in PostgreSQL.
      </p>

      <div class="setup-note">
        <b>What you need on the server:</b> Node.js 20+, a PostgreSQL 14+ database (any host), and this app running.
        No <code>.env</code> file required.
      </div>

      <div class="wizard setup-wizard">
        <div
          v-for="(label, i) in steps"
          :key="label"
          class="wstep"
          :class="{ on: !done && step === i + 1, done: done || step > i + 1 }"
          @click="!done && (step = i + 1)"
        >
          <span class="n">{{ i + 1 }}</span> {{ label }}
        </div>
      </div>

      <!-- 1 · Welcome -->
      <div class="wpanel" :class="{ active: !done && step === 1 }">
        <div class="card">
          <div class="chead"><h3>Welcome to DORINC Suite</h3></div>
          <div class="cbody" style="font-size:14px; color:#475569; line-height:1.6;">
            <p>This wizard walks you through server configuration. Each step saves independently — you can exit and resume anytime from <b>Super Admin → Control Panel</b>.</p>
            <ul style="margin:14px 0; padding-left:20px;">
              <li>Verify PostgreSQL connection</li>
              <li>Generate encryption keys and set your public app URL</li>
              <li>SMTP for verification and invoice emails</li>
              <li>PDF worker (Playwright Chromium — included in Docker workers profile)</li>
              <li>Optional: Google Drive backups and OpenRouter AI</li>
              <li>First Super Admin account</li>
            </ul>
            <p><b>Zero .env configuration.</b> Everything — database, SMTP, encryption keys — is saved by this wizard.</p>
          </div>
        </div>
      </div>

      <!-- 2 · Database -->
      <div class="wpanel" :class="{ active: !done && step === 2 }">
        <div class="card">
          <div class="chead"><h3>Connect PostgreSQL</h3></div>
          <div class="cbody">
            <label class="fld">Host <input v-model="db.host" type="text"></label>
            <label class="fld">Port <input v-model.number="db.port" type="number"></label>
            <label class="fld">Database <input v-model="db.database" type="text"></label>
            <label class="fld">Username <input v-model="db.username" type="text"></label>
            <label class="fld secret-fld">Password
              <input v-model="db.password" :type="reveal.db ? 'text' : 'password'" placeholder="Enter database password">
              <button type="button" class="reveal" @click="reveal.db = !reveal.db">{{ reveal.db ? 'Hide' : 'Show' }}</button>
            </label>
            <button class="btn primary" :disabled="busy" @click="saveDatabase">Test connection &amp; run migrations</button>
            <span v-if="db.tested || setupStatus?.progress.database" class="conn-ok show">✓ {{ db.message || 'Connected — schema up to date' }}</span>
          </div>
        </div>
      </div>

      <!-- 3 · Security (before SMTP — master key required to encrypt SMTP secrets) -->
      <div class="wpanel" :class="{ active: !done && step === 3 }">
        <div class="card">
          <div class="chead"><h3>Security &amp; encryption</h3></div>
          <div class="cbody">
            <p style="font-size:13px; color:#475569; margin:0 0 14px;">
              A master encryption key protects all stored secrets. Generate one now — you'll need step-up auth to rotate it later.
            </p>
            <label class="fld secret-fld">Master key
              <input
                :value="reveal.key ? security.masterKey : security.masterKey.replace(/[0-9a-f]/g, '•')"
                type="text"
                readonly
                style="font-family:'IBM Plex Mono',monospace;font-size:12px;"
              >
              <button type="button" class="reveal" @click="reveal.key = !reveal.key">{{ reveal.key ? 'Hide' : 'Show' }}</button>
            </label>
            <button class="btn primary" :disabled="busy || setupStatus?.envLocked.security" @click="generateKey">Generate keys</button>
            <span v-if="security.saved || setupStatus?.progress.security" class="conn-ok show">✓ Key generated and stored encrypted</span>
            <div style="margin-top:16px;">
              <label class="fld">Public app URL
                <input v-model="security.appUrl" type="url" placeholder="https://invoices.yourdomain.com">
                <span class="help">Required for portal links and credential emails</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- 4 · Email -->
      <div class="wpanel" :class="{ active: !done && step === 4 }">
        <div class="card">
          <div class="chead"><h3>Configure SMTP</h3></div>
          <div class="cbody">
            <label class="fld">SMTP host <input v-model="smtp.host" type="text" placeholder="smtp.gmail.com"></label>
            <label class="fld">Port <input v-model.number="smtp.port" type="number"></label>
            <label class="fld">Username <input v-model="smtp.username" type="email" placeholder="notifications@yourdomain.com"></label>
            <label class="fld secret-fld">Password
              <input v-model="smtp.password" :type="reveal.smtp ? 'text' : 'password'" placeholder="App password">
              <button type="button" class="reveal" @click="reveal.smtp = !reveal.smtp">{{ reveal.smtp ? 'Hide' : 'Show' }}</button>
            </label>
            <label class="fld">From address <input v-model="smtp.from" type="email" placeholder="notifications@yourdomain.com"></label>
            <button class="btn primary" :disabled="busy || setupStatus?.envLocked.smtp" @click="saveSmtp(true)">Send test email to me</button>
            <span v-if="smtp.tested || setupStatus?.progress.smtp" class="conn-ok show">✓ SMTP configured</span>
          </div>
        </div>
      </div>

      <!-- 5 · PDF -->
      <div class="wpanel" :class="{ active: !done && step === 5 }">
        <div class="card">
          <div class="chead"><h3>PDF worker</h3></div>
          <div class="cbody">
            <p style="font-size:13px; color:#475569; margin:0 0 14px;">
              PDF generation uses the Playwright worker included in the Docker <code>workers</code> profile. No extra configuration is required for most deployments.
            </p>
            <label class="fld">Default template
              <select v-model="pdf.template"><option>Professional Bill Matrix v1</option></select>
            </label>
            <span class="conn-ok show">✓ PDF worker runs with Docker workers profile</span>
          </div>
        </div>
      </div>

      <!-- 6 · Backup -->
      <div class="wpanel" :class="{ active: !done && step === 6 }">
        <div class="card">
          <div class="chead"><h3>Backup destination</h3></div>
          <div class="cbody">
            <p style="font-size:13px; color:#475569; margin:0 0 14px;">
              Connect Google Drive for encrypted nightly backups. You can skip and configure later in Control Panel.
            </p>
            <button class="btn" @click="next">Skip for now →</button>
          </div>
        </div>
      </div>

      <!-- 7 · AI -->
      <div class="wpanel" :class="{ active: !done && step === 7 }">
        <div class="card">
          <div class="chead"><h3>AI provider (optional)</h3></div>
          <div class="cbody">
            <label class="fld secret-fld">OpenRouter API key
              <input v-model="ai.apiKey" :type="reveal.ai ? 'text' : 'password'" placeholder="sk-or-…">
              <button type="button" class="reveal" @click="reveal.ai = !reveal.ai">{{ reveal.ai ? 'Hide' : 'Show' }}</button>
            </label>
            <label class="fld">Default model
              <select v-model="ai.model"><option value="anthropic/claude-sonnet-4">anthropic/claude-sonnet-4</option></select>
            </label>
            <button class="btn" @click="next">Skip for now →</button>
          </div>
        </div>
      </div>

      <!-- 8 · Admin -->
      <div class="wpanel" :class="{ active: !done && step === 8 }">
        <div class="card">
          <div class="chead"><h3>Create Super Admin</h3></div>
          <div class="cbody">
            <p style="font-size:13px; color:#475569; margin:0 0 14px;">
              The first internal account becomes Super Admin.
            </p>
            <label class="fld">Full name <input v-model="admin.name" type="text"></label>
            <label class="fld">Email <input v-model="admin.email" type="email"></label>
            <label class="fld">Password <input v-model="admin.password" type="password" placeholder="Minimum 12 characters"></label>
            <label class="fld">Confirm password <input v-model="admin.confirm" type="password" placeholder="Repeat password"></label>
            <p v-if="error" style="color:#dc2626; font-size:13px; margin:10px 0 0;">{{ error }}</p>
            <p v-if="stepMessage" style="color:#059669; font-size:13px; margin:10px 0 0;">{{ stepMessage }}</p>
          </div>
        </div>
        <div class="card" style="margin-top:16px; background:#ecfdf5; border-color:#a7f3d0;">
          <div class="cbody" style="font-size:14px; color:#065f46;">
            <b>Ready to finish?</b> Clicking <b>Complete setup</b> saves your settings, creates the Super Admin, and locks this wizard.
          </div>
        </div>
      </div>

      <!-- Done -->
      <div class="wpanel" :class="{ active: done }">
        <div class="card" style="text-align:center; padding:32px 24px;">
          <div style="font-size:48px; margin-bottom:12px;">✓</div>
          <h3 style="margin:0 0 8px;">Setup complete</h3>
          <p style="color:#64748b; margin:0 0 20px;">
            DORINC Suite is configured. Open the Control Panel anytime to review health and moderation queues.
          </p>
          <NuxtLink to="/admin" class="btn primary">Go to Control Panel</NuxtLink>
        </div>
      </div>
    </div>

    <footer v-if="!locked" class="setup-foot">
      <button class="btn" :disabled="step === 1 || done" @click="back">← Back</button>
      <span style="font-size:13px; color:#94a3b8;">Step {{ step }} of {{ steps.length }}</span>
      <div style="display:flex; gap:10px;">
        <button class="btn" :disabled="done || busy" @click="saveCurrentStep">Save step</button>
        <button class="btn primary" :disabled="done || busy" @click="next">
          {{ busy ? 'Working…' : step === steps.length ? 'Complete setup' : 'Continue →' }}
        </button>
      </div>
    </footer>
  </div>
</template>

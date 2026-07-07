<script setup lang="ts">
// First-run setup wizard UI (P0-08). Backend wiring lands in P1-04.
definePageMeta({ layout: false })

const steps = ['Welcome', 'Database', 'Email', 'Security', 'PDF', 'Backup', 'AI', 'Admin'] as const

const step = ref(1)
const done = ref(false)
const busy = ref(false)
const error = ref('')
const locked = ref(false)

// Bootstrap locks after the first Super Admin exists (SPEC §5)
const { data: setupStatus } = await useFetch<{ needsBootstrap: boolean }>('/api/setup/status')
if (setupStatus.value && !setupStatus.value.needsBootstrap) {
  locked.value = true
}

// Step form state (persisted via API in P1-04)
const db = reactive({ host: 'localhost', port: 5432, database: 'dorinc_prod', username: 'dorinc_app', password: '' })
const smtp = reactive({ host: '', port: 587, username: '', password: '', from: '' })
const security = reactive({ masterKey: '(click Generate)', appUrl: '' })
const pdf = reactive({ serviceUrl: 'http://localhost:3100/pdf', template: 'Professional Bill Matrix v1' })
const ai = reactive({ apiKey: '', model: 'anthropic/claude-sonnet' })
const admin = reactive({ name: '', email: '', password: '', confirm: '', sendVerification: true })

const reveal = reactive<Record<string, boolean>>({})

function generateKey() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  security.masterKey = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

function back() {
  if (step.value > 1) step.value -= 1
}

async function next() {
  if (step.value < steps.length) {
    step.value += 1
    return
  }

  // Final step: create the Super Admin via the bootstrap API
  error.value = ''
  if (admin.password !== admin.confirm) {
    error.value = 'Passwords do not match'
    return
  }
  busy.value = true
  try {
    await $fetch('/api/setup/bootstrap', {
      method: 'POST',
      body: { name: admin.name, email: admin.email, password: admin.password },
    })
    done.value = true
  }
  catch (err) {
    const fe = err as { data?: { data?: { message?: string } } }
    error.value = fe.data?.data?.message ?? 'Bootstrap failed — check the fields and try again'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="setup-scrim open" role="dialog" aria-label="Server setup wizard">
    <header class="setup-top">
      <div class="logo"><span class="sq">DR</span> DORINC Suite</div>
      <span class="sp" />
      <span class="pill indigo">First-run setup</span>
      <button class="btn">Save &amp; exit</button>
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
        Configure everything from the UI — no .env file editing. Secrets are encrypted and stored in PostgreSQL.
      </p>

      <div class="setup-note">
        <b>What you need on the server:</b> Node.js 20+, PostgreSQL 14+, and this Nuxt app running. Everything else —
        database credentials, SMTP, API keys, encryption — is configured in the steps below.
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
              <li>Database connection to PostgreSQL</li>
              <li>SMTP for verification and invoice emails</li>
              <li>Encryption master key (auto-generated)</li>
              <li>PDF worker (Playwright Chromium)</li>
              <li>Encrypted Google Drive backups</li>
              <li>OpenRouter AI credentials</li>
              <li>First Super Admin account</li>
            </ul>
            <p><b>No .env secrets required.</b> The app ships with a single bootstrap connection string. All production secrets live in encrypted <code>app_settings</code> rows.</p>
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
            <button class="btn primary">Test connection &amp; run migrations</button>
            <span class="conn-ok">✓ Connected — schema up to date</span>
          </div>
        </div>
      </div>

      <!-- 3 · Email -->
      <div class="wpanel" :class="{ active: !done && step === 3 }">
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
            <button class="btn primary">Send test email to me</button>
            <span class="conn-ok">✓ Test email delivered</span>
          </div>
        </div>
      </div>

      <!-- 4 · Security -->
      <div class="wpanel" :class="{ active: !done && step === 4 }">
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
            <button class="btn primary" @click="generateKey">Generate master key</button>
            <span class="conn-ok" :class="{ show: security.masterKey.length === 64 }">✓ Key generated and stored encrypted</span>
            <div style="margin-top:16px;">
              <label class="fld">Public app URL
                <input v-model="security.appUrl" type="url" placeholder="https://invoices.yourdomain.com">
                <span class="help">Required for portal links and credential emails</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- 5 · PDF -->
      <div class="wpanel" :class="{ active: !done && step === 5 }">
        <div class="card">
          <div class="chead"><h3>PDF worker</h3></div>
          <div class="cbody">
            <label class="fld">PDF service URL <input v-model="pdf.serviceUrl" type="url"></label>
            <label class="fld">Default template
              <select v-model="pdf.template"><option>Professional Bill Matrix v1</option></select>
            </label>
            <button class="btn primary">Test render sample invoice</button>
            <span class="conn-ok">✓ PDF generated successfully</span>
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
            <button class="btn primary">Connect Google Drive (OAuth)</button>
            <button class="btn" @click="next">Skip for now</button>
            <span class="conn-ok">✓ Connected</span>
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
              <select v-model="ai.model"><option>anthropic/claude-sonnet</option></select>
            </label>
            <button class="btn primary">Test connection</button>
            <button class="btn" @click="next">Skip for now</button>
            <span class="conn-ok">✓ API key valid</span>
          </div>
        </div>
      </div>

      <!-- 8 · Admin -->
      <div class="wpanel" :class="{ active: !done && step === 8 }">
        <div class="card">
          <div class="chead"><h3>Create Super Admin</h3></div>
          <div class="cbody">
            <p style="font-size:13px; color:#475569; margin:0 0 14px;">
              The first internal account becomes Super Admin. Email verification is sent via SMTP configured in step 3.
            </p>
            <label class="fld">Full name <input v-model="admin.name" type="text"></label>
            <label class="fld">Email <input v-model="admin.email" type="email"></label>
            <label class="fld">Password <input v-model="admin.password" type="password" placeholder="Minimum 12 characters"></label>
            <label class="fld">Confirm password <input v-model="admin.confirm" type="password" placeholder="Repeat password"></label>
            <div class="tglrow">Send verification email now <span class="tgl"><input v-model="admin.sendVerification" type="checkbox"><span class="tr" /></span></div>
            <p v-if="error" style="color:#dc2626; font-size:13px; margin:10px 0 0;">{{ error }}</p>
          </div>
        </div>
        <div class="card" style="margin-top:16px; background:#ecfdf5; border-color:#a7f3d0;">
          <div class="cbody" style="font-size:14px; color:#065f46;">
            <b>Ready to finish?</b> Clicking <b>Complete setup</b> enables the full app, disables the bootstrap screen,
            and logs audit entries for each configured service.
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
        <button class="btn" :disabled="done">Save step</button>
        <button class="btn primary" :disabled="done || busy" @click="next">
          {{ busy ? 'Working…' : step === steps.length ? 'Complete setup' : 'Continue →' }}
        </button>
      </div>
    </footer>
  </div>
</template>

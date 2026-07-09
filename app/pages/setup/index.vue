<script setup lang="ts">
import { BRAND_ICON, BRAND_NAME } from '~/constants/brand'
import { parsePostgresConnectionString } from '#shared/postgres-connection'

definePageMeta({ layout: false })

const steps = ['Welcome', 'Database', 'Security', 'Email', 'PDF', 'Backup', 'AI', 'Admin'] as const

const welcomeSlides = [
  {
    image: '/images/welcome-invoices.png',
    tagline: 'Send bills that look like you mean business',
    title: 'Invoices & PDFs',
    desc: 'Build invoices from shop work, record payments as they come in, and print or email PDF copies to customers.',
    details: ['Line items for parts, labor, and shop fees', 'Balances and payment history', 'Professional PDFs ready to send'],
  },
  {
    image: '/images/welcome-vehicles.png',
    tagline: 'Every truck and trailer on record',
    title: 'Fleet & vehicles',
    desc: 'Attach units to customer accounts and pull up vehicle details the moment a job comes in.',
    details: ['VIN, plate, and unit numbers', 'Retail and fleet accounts', 'Service history per unit'],
  },
  {
    image: '/images/welcome-portal.png',
    tagline: 'A login for your customers',
    title: 'Customer portal',
    desc: 'Give customers their own secure login to stay on top of work and paperwork.',
    details: ['View invoices anytime', 'Download PDF copies', 'Submit requests and approve estimates'],
  },
  {
    image: '/images/welcome-service-logs.png',
    tagline: 'The job story, start to finish',
    title: 'Service logs',
    desc: 'Document what happened in the bay with the detail your bookkeeper and customer both need.',
    details: ['Photos on the job record', 'Parts and labor line by line', 'History on each vehicle'],
  },
  {
    image: '/images/welcome-catalog.png',
    tagline: 'Your rates, saved and ready',
    title: 'Parts & labor catalog',
    desc: 'Build a catalog of the parts and labor rates your shop uses every day.',
    details: ['Reuse common line items', 'Drop onto invoices and logs', 'Consistent pricing for your team'],
  },
  {
    image: '/images/welcome-templates.png',
    tagline: 'Your brand on every bill',
    title: 'Invoice templates',
    desc: 'Design invoice layouts with your logo, columns, and shop details baked in.',
    details: ['Template designer', 'Branded PDF output', 'Update once, reuse forever'],
  },
  {
    image: '/images/welcome-estimates.png',
    tagline: 'Quotes before the wrench turns',
    title: 'Estimates',
    desc: 'Send estimates for upcoming work and let customers approve before you start.',
    details: ['Same line-item tools', 'Portal review and approval', 'Convert to invoices'],
  },
  {
    image: '/images/welcome-customers.png',
    tagline: 'One list for your whole book',
    title: 'Customers & fleets',
    desc: 'Keep retail walk-ins and fleet accounts organized with contacts, vehicles, and billing in one profile.',
    details: ['Customer profiles', 'Fleet accounts with many units', 'Billing and portal access'],
  },
  {
    image: '/images/welcome-ai-descriptions.png',
    tagline: 'Help writing invoice lines',
    title: 'AI invoice descriptions',
    desc: 'When a line item needs the right words, AI drafts descriptions from your invoice context.',
    details: ['Works on draft invoices', 'Clear parts and labor wording', 'You approve before it saves'],
    ai: true,
  },
  {
    image: '/images/welcome-ai-extraction.png',
    tagline: 'Pull details out of shop notes',
    title: 'AI service log extraction',
    desc: 'Add photos or rough notes on a job and AI suggests parts, labor, and log details to review.',
    details: ['Extract from notes and photos', 'Review queue for your team', 'Accept or edit before adding'],
    ai: true,
  },
  {
    image: '/images/welcome-ai-help.png',
    tagline: 'Answers without leaving the app',
    title: 'AI help assistant',
    desc: 'Staff can ask how-to questions inside DORINC and get answers about daily shop workflows.',
    details: ['Help chat on staff screens', 'Invoices, customers, and logs', 'Great for new hires'],
    ai: true,
  },
] as const

const step = ref(1)
const done = ref(false)
const busy = ref(false)
const error = ref('')
const stepMessage = ref('')
const locked = ref(false)
const setupWizardRef = ref<HTMLElement | null>(null)

const WELCOME_AUTOPLAY_MS = 3000
const welcomeSlide = ref(0)
const welcomeTouchStart = ref<number | null>(null)
const welcomePaused = ref(false)
const welcomeProgressKey = ref(0)
let welcomeTimer: ReturnType<typeof setInterval> | null = null

function goWelcomeSlide(index: number) {
  welcomeSlide.value = ((index % welcomeSlides.length) + welcomeSlides.length) % welcomeSlides.length
  welcomeProgressKey.value += 1
}

function prevWelcomeSlide() {
  goWelcomeSlide(welcomeSlide.value - 1)
}

function nextWelcomeSlide() {
  goWelcomeSlide(welcomeSlide.value + 1)
}

function stopWelcomeAutoplay() {
  if (welcomeTimer) {
    clearInterval(welcomeTimer)
    welcomeTimer = null
  }
}

function startWelcomeAutoplay() {
  stopWelcomeAutoplay()
  if (welcomePaused.value || !import.meta.client) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  welcomeTimer = setInterval(() => {
    if (step.value === 1 && !done.value && !welcomePaused.value) nextWelcomeSlide()
  }, WELCOME_AUTOPLAY_MS)
}

function pauseWelcomeAutoplay() {
  welcomePaused.value = true
  stopWelcomeAutoplay()
}

function resumeWelcomeAutoplay() {
  welcomePaused.value = false
  startWelcomeAutoplay()
}

function onWelcomeTouchStart(event: TouchEvent) {
  welcomeTouchStart.value = event.touches[0]?.clientX ?? null
  pauseWelcomeAutoplay()
}

function onWelcomeTouchEnd(event: TouchEvent) {
  if (welcomeTouchStart.value == null) return
  const endX = event.changedTouches[0]?.clientX ?? welcomeTouchStart.value
  const delta = endX - welcomeTouchStart.value
  welcomeTouchStart.value = null
  if (Math.abs(delta) >= 40) {
    if (delta < 0) nextWelcomeSlide()
    else prevWelcomeSlide()
  }
  resumeWelcomeAutoplay()
}

function scrollActiveSetupStep() {
  if (!import.meta.client || window.innerWidth > 640) return
  nextTick(() => {
    setupWizardRef.value?.querySelector<HTMLElement>('.wstep.on')?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    })
  })
}

watch(step, (n) => {
  scrollActiveSetupStep()
  if (n === 1) startWelcomeAutoplay()
  else stopWelcomeAutoplay()
})

onMounted(() => {
  scrollActiveSetupStep()
  if (step.value === 1) startWelcomeAutoplay()
})

onBeforeUnmount(stopWelcomeAutoplay)

const { data: setupStatus, refresh: refreshStatus } = await useFetch<{
  needsBootstrap: boolean
  progress: { database: boolean, smtp: boolean, security: boolean, ai: boolean }
  envLocked: { security: boolean, appUrl: boolean, smtp: boolean }
  env: { appUrl: string | null }
}>('/api/setup/status')

if (setupStatus.value && !setupStatus.value.needsBootstrap) {
  locked.value = true
}

const appUrlEnvLocked = computed(() => !!setupStatus.value?.envLocked.appUrl)

const dbMode = ref<'connectionString' | 'fields'>('connectionString')

const db = reactive({
  connectionString: '',
  host: 'localhost',
  port: 5432,
  database: 'dorinc',
  username: 'postgres',
  password: '',
  status: 'idle' as 'idle' | 'loading' | 'success' | 'error',
  message: '',
  errorMessage: '',
  parseError: '',
})

const dbParsedPreview = computed(() => {
  if (dbMode.value !== 'connectionString' || !db.connectionString.trim()) {
    return null
  }
  try {
    return parsePostgresConnectionString(db.connectionString)
  }
  catch {
    return null
  }
})

watch(dbMode, (mode) => {
  db.parseError = ''
  if (mode === 'fields' && dbParsedPreview.value) {
    Object.assign(db, dbParsedPreview.value)
  }
})

watch(() => db.connectionString, () => {
  db.parseError = ''
  if (dbMode.value !== 'connectionString' || !db.connectionString.trim()) return
  try {
    parsePostgresConnectionString(db.connectionString)
  }
  catch (err) {
    db.parseError = (err as Error).message
  }
})
const smtp = reactive({
  host: '',
  port: 587,
  username: '',
  password: '',
  fromName: 'DORINC',
  from: '',
  status: 'idle' as 'idle' | 'loading' | 'success' | 'error',
  message: '',
  errorMessage: '',
})
const security = reactive({
  masterKey: '',
  sessionSecret: '',
  appUrl: '',
  status: 'idle' as 'idle' | 'loading' | 'success' | 'error',
  message: '',
  errorMessage: '',
})
const pdf = reactive({ serviceUrl: 'http://localhost:3100/pdf', template: 'Professional Bill Matrix v1' })
const ai = reactive({ apiKey: '', model: 'anthropic/claude-sonnet-4', saved: false })
const admin = reactive({ name: '', email: '', password: '', confirm: '', sendVerification: true })

const reveal = reactive<Record<string, boolean>>({})

if (setupStatus.value?.env?.appUrl) {
  security.appUrl = setupStatus.value.env.appUrl
}
else if (import.meta.client && !security.appUrl) {
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

function stepComplete(n: number): boolean {
  const p = setupStatus.value?.progress
  if (!p) return false
  if (n === 2) return p.database
  if (n === 3) return p.security
  if (n === 4) return p.smtp
  if (n === 7) return p.ai
  return false
}

function back() {
  if (step.value > 1) step.value -= 1
}

function fetchErrorMessage(err: unknown, fallback: string): string {
  const e = err as {
    data?: { message?: string, data?: { message?: string }, statusMessage?: string }
    message?: string
    statusMessage?: string
  }
  const msg = e?.data?.message || e?.data?.data?.message || e?.message || e?.statusMessage
  if (msg && msg !== 'Server Error') return msg
  return fallback
}

async function saveDatabase() {
  busy.value = true
  error.value = ''
  stepMessage.value = ''
  db.status = 'loading'
  db.errorMessage = ''
  db.parseError = ''
  try {
    const body = dbMode.value === 'connectionString'
      ? { connectionString: db.connectionString.trim() }
      : {
          host: db.host,
          port: db.port,
          database: db.database,
          username: db.username,
          password: db.password,
        }

    if (dbMode.value === 'connectionString' && !db.connectionString.trim()) {
      db.parseError = 'Paste your PostgreSQL connection string from Dockploy'
      db.status = 'error'
      db.errorMessage = db.parseError
      error.value = db.parseError
      return false
    }

    const res = await $fetch<{ ok: boolean, message: string }>('/api/setup/database', {
      method: 'POST',
      body,
    })
    db.status = 'success'
    db.message = res.message
    stepMessage.value = res.message
    await refreshStatus()
    return true
  }
  catch (err) {
    db.status = 'error'
    db.errorMessage = fetchErrorMessage(err, 'Database setup failed')
    error.value = db.errorMessage
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
  security.status = 'loading'
  security.errorMessage = ''
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
    security.status = 'success'
    security.message = 'Security settings saved — encryption keys stored'
    stepMessage.value = security.message
    await refreshStatus()
    return true
  }
  catch (err) {
    security.status = 'error'
    security.errorMessage = fetchErrorMessage(err, 'Failed to save security settings')
    error.value = security.errorMessage
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
  smtp.status = 'loading'
  smtp.errorMessage = ''
  try {
    const fromAddress = smtp.from.trim()
    const fromName = smtp.fromName.trim()
    const from = fromName
      ? `"${fromName.replace(/"/g, '')}" <${fromAddress}>`
      : fromAddress
    const body = {
      host: smtp.host,
      port: smtp.port,
      username: smtp.username,
      password: smtp.password,
      from,
      to: admin.email || fromAddress,
    }
    const res = test
      ? await $fetch<{ message: string, delivered?: boolean }>('/api/setup/smtp-test', { method: 'POST', body })
      : await $fetch<{ message: string }>('/api/setup/smtp', { method: 'POST', body })
    smtp.status = 'success'
    smtp.message = res.message
    stepMessage.value = res.message
    await refreshStatus()
    return true
  }
  catch (err) {
    smtp.status = 'error'
    smtp.errorMessage = fetchErrorMessage(err, 'Failed to save SMTP settings')
    error.value = smtp.errorMessage
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
      <div class="logo"><img class="sq" :src="BRAND_ICON" alt="" width="32" height="32"> {{ BRAND_NAME }}</div>
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
      <div class="setup-head">
        <header class="setup-hero">
          <img
            src="/images/banner-1.png"
            alt="DORINC — shop invoice software for service shops and fleet billing"
            class="setup-hero__img"
            width="1200"
            height="630"
          >
        </header>

        <div ref="setupWizardRef" class="wizard setup-wizard">
          <div
            v-for="(label, i) in steps"
            :key="label"
            class="wstep"
            :class="{ on: !done && step === i + 1, done: done || step > i + 1 || stepComplete(i + 1) }"
            @click="!done && (step = i + 1)"
          >
            <span class="n">{{ i + 1 }}</span> {{ label }}
          </div>
        </div>
      </div>

      <!-- 1 · Welcome -->
      <div class="wpanel" :class="{ active: !done && step === 1 }">
        <div class="card setup-welcome">
          <div
            class="setup-welcome__viewport"
            @mouseenter="pauseWelcomeAutoplay"
            @mouseleave="resumeWelcomeAutoplay"
            @focusin="pauseWelcomeAutoplay"
            @focusout="resumeWelcomeAutoplay"
            @touchstart.passive="onWelcomeTouchStart"
            @touchend.passive="onWelcomeTouchEnd"
          >
            <div
              class="setup-welcome__track"
              :style="{ transform: `translateX(-${welcomeSlide * 100}%)` }"
            >
              <article
                v-for="slide in welcomeSlides"
                :key="slide.title"
                class="setup-welcome__hero"
                :class="{ 'setup-welcome__hero--ai': slide.ai }"
              >
                <div class="setup-welcome__glow" aria-hidden="true" />
                <div class="setup-welcome__copy">
                  <h2 class="setup-welcome__title">{{ slide.title }}</h2>
                  <p class="setup-welcome__tagline">{{ slide.tagline }}</p>
                  <p class="setup-welcome__desc">{{ slide.desc }}</p>
                  <ul class="setup-welcome__bullets">
                    <li v-for="detail in slide.details" :key="detail">{{ detail }}</li>
                  </ul>
                </div>
                <div class="setup-welcome__shot">
                  <div class="setup-welcome__shot-frame">
                    <img
                      :src="slide.image"
                      :alt="`${slide.title} preview`"
                      class="setup-welcome__shot-img"
                      width="1198"
                      height="900"
                      loading="lazy"
                    >
                  </div>
                </div>
              </article>
            </div>

            <button
              type="button"
              class="setup-welcome__arrow setup-welcome__arrow--prev"
              aria-label="Previous feature"
              @click="prevWelcomeSlide(); startWelcomeAutoplay()"
            >
              ‹
            </button>
            <button
              type="button"
              class="setup-welcome__arrow setup-welcome__arrow--next"
              aria-label="Next feature"
              @click="nextWelcomeSlide(); startWelcomeAutoplay()"
            >
              ›
            </button>

            <div class="setup-welcome__foot">
              <div class="setup-welcome__timer" aria-hidden="true">
                <div
                  :key="welcomeProgressKey"
                  class="setup-welcome__timer-fill"
                  :class="{ paused: welcomePaused }"
                />
              </div>
              <div class="setup-welcome__dots" role="tablist" aria-label="Feature slides">
                <button
                  v-for="(_, i) in welcomeSlides"
                  :key="i"
                  type="button"
                  role="tab"
                  class="setup-welcome__dot"
                  :class="{ on: welcomeSlide === i }"
                  :aria-selected="welcomeSlide === i"
                  :aria-label="`${welcomeSlides[i].title}, slide ${i + 1} of ${welcomeSlides.length}`"
                  @click="goWelcomeSlide(i); startWelcomeAutoplay()"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2 · Database -->
      <div class="wpanel" :class="{ active: !done && step === 2 }">
        <div class="card">
          <div class="chead"><h3>Connect PostgreSQL</h3></div>
          <div class="cbody">
            <p class="setup-step-hint">
              Paste the full connection string from Dockploy, or enter host and credentials separately.
            </p>
            <label class="fld">Connection method
              <select v-model="dbMode">
                <option value="connectionString">Connection string (Dockploy)</option>
                <option value="fields">Separate fields (advanced)</option>
              </select>
            </label>

            <template v-if="dbMode === 'connectionString'">
              <label class="fld">Connection string
                <input
                  v-model="db.connectionString"
                  type="text"
                  placeholder="postgresql://postgres:password@host:5432/postgres"
                  autocomplete="off"
                  spellcheck="false"
                  style="font-family:'IBM Plex Mono',monospace;font-size:12px;"
                >
                <span class="help">Copy the full URI from your Dockploy PostgreSQL app — do not paste it into Host.</span>
              </label>
              <div v-if="dbParsedPreview" class="setup-db-preview" role="status">
                <p class="setup-db-preview__title">Parsed connection</p>
                <dl class="setup-db-preview__grid">
                  <dt>Host</dt><dd>{{ dbParsedPreview.host }}</dd>
                  <dt>Port</dt><dd>{{ dbParsedPreview.port }}</dd>
                  <dt>Database</dt><dd>{{ dbParsedPreview.database }}</dd>
                  <dt>Username</dt><dd>{{ dbParsedPreview.username }}</dd>
                </dl>
              </div>
              <div v-else-if="db.parseError" class="setup-feedback setup-feedback--error" role="alert">
                {{ db.parseError }}
              </div>
            </template>

            <template v-else>
              <label class="fld">Host <input v-model="db.host" type="text" placeholder="dorinc-suite-data-aa6dyg"></label>
              <label class="fld">Port <input v-model.number="db.port" type="number"></label>
              <label class="fld">Database <input v-model="db.database" type="text"></label>
              <label class="fld">Username <input v-model="db.username" type="text"></label>
              <label class="fld secret-fld">Password
                <input v-model="db.password" :type="reveal.db ? 'text' : 'password'" placeholder="Enter database password">
                <button type="button" class="reveal" @click="reveal.db = !reveal.db">{{ reveal.db ? 'Hide' : 'Show' }}</button>
              </label>
            </template>

            <button class="btn primary" :disabled="busy" @click="saveDatabase">
              {{ db.status === 'loading' ? 'Connecting…' : 'Test connection & run migrations' }}
            </button>
            <div
              v-if="db.status === 'success' || setupStatus?.progress.database"
              class="setup-feedback setup-feedback--success"
              role="status"
            >
              ✓ {{ db.message || 'Connected — schema up to date' }}
            </div>
            <div v-else-if="db.status === 'error'" class="setup-feedback setup-feedback--error" role="alert">
              {{ db.errorMessage }}
            </div>
          </div>
        </div>
      </div>

      <!-- 3 · Security (before SMTP — master key required to encrypt SMTP secrets) -->
      <div class="wpanel" :class="{ active: !done && step === 3 }">
        <div class="card">
          <div class="chead"><h3>Security &amp; encryption</h3></div>
          <div class="cbody">
            <p class="setup-step-hint">
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
            <div class="setup-actions">
              <button class="btn primary" :disabled="busy || setupStatus?.envLocked.security" @click="generateKey">Generate keys</button>
              <button class="btn" :disabled="busy || setupStatus?.envLocked.security" @click="saveSecurity">
                {{ security.status === 'loading' ? 'Saving…' : 'Save security settings' }}
              </button>
            </div>
            <div
              v-if="security.status === 'success' || setupStatus?.progress.security"
              class="setup-feedback setup-feedback--success"
              role="status"
            >
              ✓ {{ security.message || 'Encryption keys stored securely' }}
            </div>
            <div v-else-if="security.status === 'error'" class="setup-feedback setup-feedback--error" role="alert">
              {{ security.errorMessage }}
            </div>
            <div style="margin-top:16px;">
              <label class="fld">Public app URL
                <input
                  v-model="security.appUrl"
                  type="url"
                  placeholder="https://invoices.yourdomain.com"
                  :readonly="appUrlEnvLocked"
                >
                <span class="help">
                  {{ appUrlEnvLocked
                    ? 'Set from APP_URL in Dockploy — used for portal links and emails'
                    : 'Required for portal links and credential emails' }}
                </span>
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
            <label class="fld">From name <input v-model="smtp.fromName" type="text" placeholder="DORINC"></label>
            <label class="fld">From address <input v-model="smtp.from" type="email" placeholder="notifications@yourdomain.com"></label>
            <span class="help" style="display:block;margin:-6px 0 12px;">Shown in inboxes as: {{ smtp.fromName.trim() || 'DORINC' }} &lt;{{ smtp.from.trim() || 'notifications@yourdomain.com' }}&gt;</span>
            <div class="setup-actions">
              <button class="btn primary" :disabled="busy || setupStatus?.envLocked.smtp" @click="saveSmtp(true)">
                {{ smtp.status === 'loading' ? 'Sending test…' : 'Send test email' }}
              </button>
              <button class="btn" :disabled="busy || setupStatus?.envLocked.smtp" @click="saveSmtp(false)">
                Save without test
              </button>
            </div>
            <div
              v-if="smtp.status === 'success' || setupStatus?.progress.smtp"
              class="setup-feedback setup-feedback--success"
              role="status"
            >
              ✓ {{ smtp.message || 'SMTP configured' }}
            </div>
            <div v-else-if="smtp.status === 'error'" class="setup-feedback setup-feedback--error" role="alert">
              {{ smtp.errorMessage }}
            </div>
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
            {{ BRAND_NAME }} is configured. Open the Control Panel anytime to review health and moderation queues.
          </p>
          <NuxtLink to="/admin" class="btn primary">Go to Control Panel</NuxtLink>
        </div>
      </div>
    </div>

    <footer v-if="!locked" class="setup-foot">
      <button class="btn" :disabled="step === 1 || done" @click="back">← Back</button>
      <span class="setup-foot__progress">Step {{ step }} of {{ steps.length }}</span>
      <div class="setup-foot__actions">
        <button class="btn" :disabled="done || busy" @click="saveCurrentStep">Save step</button>
        <button class="btn primary" :disabled="done || busy" @click="next">
          {{ busy ? 'Working…' : step === steps.length ? 'Complete setup' : 'Continue →' }}
        </button>
      </div>
    </footer>
  </div>
</template>

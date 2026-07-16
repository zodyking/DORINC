<script setup lang="ts">
import { BRAND_ICON, BRAND_NAME } from '~/constants/brand'
import { toTitleCase } from '#shared/format/person-name'
import { authErrorEmail, authErrorMessage, authErrorReason } from '~/utils/auth-errors'
import { mapStaffLoginGeoError, requestStaffLoginGeo } from '~/utils/staff-login-geo'

const props = defineProps<{
  initialCard?: 'customer' | 'staff'
  initialTab?: 'login' | 'signup'
}>()

const card = ref<'customer' | 'staff'>(props.initialCard ?? 'customer')
const tab = ref<'login' | 'signup'>(props.initialTab ?? 'login')

const auth = useAuthStore()
const { busy: resendBusy, message: resendMessage, error: resendError, resend, reset: resetResend } = useResendVerification()

const { data: publicBusiness } = useClientFetch<{ businessName: string }>('/api/public/business')
const displayBusinessName = computed(() => {
  const name = publicBusiness.value?.businessName?.trim()
  return name || BRAND_NAME
})

const portalUsername = ref('')
const portalPass = ref('')
const loginEmail = ref('')
const loginPass = ref('')
const signupFirstName = ref('')
const signupLastName = ref('')
const signupEmail = ref('')
const signupPass = ref('')
const signupConfirm = ref('')
const signupType = ref('Mechanic')

const reveal = reactive({
  portal: false,
  login: false,
  signupPass: false,
  signupConfirm: false,
})

const busy = ref(false)
const error = ref('')
const notice = ref('')
const loginBlockedReason = ref<string | null>(null)
const signupSubmittedEmail = ref('')

function messageFrom(err: unknown): string {
  return authErrorMessage(err)
}

function titleCaseNameField(field: Ref<string>) {
  field.value = toTitleCase(field.value)
}

const resendVerificationLink = computed(() => {
  const email = loginEmail.value.trim() || signupSubmittedEmail.value.trim()
  return email
    ? `/auth/resend-verification?email=${encodeURIComponent(email)}`
    : '/auth/resend-verification'
})

const staffForgotPasswordLink = computed(() => {
  const email = loginEmail.value.trim()
  return email
    ? `/auth/forgot-password?email=${encodeURIComponent(email)}`
    : '/auth/forgot-password'
})

async function submitLogin(identifier: string, password: string) {
  busy.value = true
  error.value = ''
  loginBlockedReason.value = null
  resetResend()
  try {
    let geo
    if (card.value === 'staff') {
      geo = await requestStaffLoginGeo()
    }
    const user = await auth.login(identifier, password, card.value, geo)
    await navigateTo(user.accountType === 'customer' ? '/portal' : '/dashboard')
  }
  catch (err) {
    const geoMessage = mapStaffLoginGeoError(err)
    if ((err as Error)?.message?.startsWith('GEO_')) {
      error.value = geoMessage
    }
    else {
      error.value = messageFrom(err)
      loginBlockedReason.value = authErrorReason(err)
      const hintedEmail = authErrorEmail(err)
      if (hintedEmail && card.value === 'staff') loginEmail.value = hintedEmail
    }
  }
  finally {
    busy.value = false
  }
}

async function submitResendFromLogin() {
  resetResend()
  await resend(loginEmail.value, loginPass.value)
}

async function submitSignup() {
  busy.value = true
  error.value = ''
  notice.value = ''
  signupSubmittedEmail.value = ''
  resetResend()
  if (signupPass.value !== signupConfirm.value) {
    error.value = 'Passwords do not match'
    busy.value = false
    return
  }
  titleCaseNameField(signupFirstName)
  titleCaseNameField(signupLastName)
  try {
    const res = await $fetch<{ message: string }>('/api/auth/signup', {
      method: 'POST',
      body: {
        firstName: signupFirstName.value,
        lastName: signupLastName.value,
        email: signupEmail.value,
        password: signupPass.value,
        accountType: signupType.value.toLowerCase(),
      },
    })
    notice.value = res.message
    signupSubmittedEmail.value = signupEmail.value.trim()
    tab.value = 'login'
    loginEmail.value = signupSubmittedEmail.value
    loginPass.value = signupPass.value
  }
  catch (err) {
    error.value = messageFrom(err)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <main id="main-content" class="auth-screen">
    <div class="auth-wrap">
      <!-- Customer portal card -->
      <div v-if="card === 'customer'" class="auth-card">
        <div class="auth-head">
          <img class="sq" :src="BRAND_ICON" alt="" width="40" height="40">
          <div class="auth-head__text">
            <b>{{ displayBusinessName }}</b>
            <small>Customer portal</small>
          </div>
        </div>
        <div class="auth-body">
          <form @submit.prevent="submitLogin(portalUsername, portalPass)">
            <div class="fld">
              <label for="portal-username">Username</label>
              <input
                id="portal-username"
                v-model="portalUsername"
                type="text"
                autocomplete="username"
                autocapitalize="none"
                spellcheck="false"
                required
              >
            </div>
            <div class="fld">
              <label for="portal-password">Password</label>
              <div class="secret-fld">
                <input
                  id="portal-password"
                  v-model="portalPass"
                  :type="reveal.portal ? 'text' : 'password'"
                  autocomplete="current-password"
                  required
                >
                <button type="button" class="reveal" @click="reveal.portal = !reveal.portal">
                  {{ reveal.portal ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>
            <p v-if="error" class="auth-hint auth-error" role="alert">{{ error }}</p>
            <div class="auth-foot">
              <NuxtLink to="/auth/forgot-password?portal=customer" class="auth-link">Forgot password?</NuxtLink>
            </div>
            <button type="submit" class="btn primary" :disabled="busy" style="width:100%;justify-content:center;margin-top:14px;padding:11px;">
              {{ busy ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>
        </div>
      </div>

      <!-- Staff workspace card -->
      <div v-if="card === 'staff'" class="auth-card">
        <div class="auth-head">
          <img class="sq" :src="BRAND_ICON" alt="" width="40" height="40">
          <div class="auth-head__text">
            <b>{{ displayBusinessName }}</b>
            <small>Staff workspace</small>
          </div>
        </div>
        <div class="auth-tabs" role="tablist" aria-label="Staff sign in options">
          <button type="button" role="tab" :aria-selected="tab === 'login'" :class="{ on: tab === 'login' }" @click="tab = 'login'">Sign in</button>
          <button type="button" role="tab" :aria-selected="tab === 'signup'" :class="{ on: tab === 'signup' }" @click="tab = 'signup'">Request account</button>
        </div>
        <div class="auth-panel" role="tabpanel" :class="{ active: tab === 'login' }">
          <form @submit.prevent="submitLogin(loginEmail, loginPass)">
            <div class="fld">
              <label for="staff-login-email">Email</label>
              <input id="staff-login-email" v-model="loginEmail" type="email" autocomplete="username" required>
            </div>
            <div class="fld">
              <label for="staff-login-password">Password</label>
              <div class="secret-fld">
                <input
                  id="staff-login-password"
                  v-model="loginPass"
                  :type="reveal.login ? 'text' : 'password'"
                  autocomplete="current-password"
                  required
                >
                <button type="button" class="reveal" @click="reveal.login = !reveal.login">
                  {{ reveal.login ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>
            <p class="auth-hint">
              Staff sign-in requires your device location for security alerts. Your browser will ask for permission.
            </p>
            <p v-if="error" class="auth-hint auth-error" role="alert">{{ error }}</p>

            <div v-if="loginBlockedReason === 'not_verified'" class="auth-callout">
              <p class="auth-hint">Your account exists but email is not verified yet.</p>
              <p v-if="resendMessage" class="auth-hint auth-success" role="status">{{ resendMessage }}</p>
              <p v-if="resendError" class="auth-hint auth-error" role="alert">{{ resendError }}</p>
              <button
                type="button"
                class="btn sm"
                :disabled="resendBusy || !loginEmail || !loginPass"
                @click="submitResendFromLogin"
              >
                {{ resendBusy ? 'Sending…' : 'Resend verification email' }}
              </button>
              <NuxtLink :to="resendVerificationLink" class="auth-link auth-callout-link">
                Open resend page
              </NuxtLink>
            </div>

            <div v-else-if="loginBlockedReason === 'not_approved'" class="auth-callout">
              <p class="auth-hint">Your email is verified. An administrator still needs to approve your account.</p>
            </div>

            <p v-if="notice" class="auth-hint auth-success" role="status">{{ notice }}</p>
            <div v-if="notice" class="auth-callout">
              <p class="auth-hint">Did not get the verification email?</p>
              <NuxtLink :to="resendVerificationLink" class="auth-link auth-callout-link">
                Resend verification email
              </NuxtLink>
            </div>

            <div class="auth-foot">
              <NuxtLink :to="staffForgotPasswordLink" class="auth-link">Forgot password?</NuxtLink>
            </div>
            <button type="submit" class="btn primary" :disabled="busy" style="width:100%;justify-content:center;margin-top:14px;padding:11px;">
              {{ busy ? 'Getting location…' : 'Sign in' }}
            </button>
          </form>
        </div>
        <div class="auth-panel" role="tabpanel" :class="{ active: tab === 'signup' }">
          <form @submit.prevent="submitSignup">
            <div class="row2">
              <div class="fld">
                <label for="signup-first-name">First Name</label>
                <input
                  id="signup-first-name"
                  v-model="signupFirstName"
                  data-prose="name"
                  type="text"
                  placeholder="Jordan"
                  autocomplete="given-name"
                  required
                >
              </div>
              <div class="fld">
                <label for="signup-last-name">Last Name</label>
                <input
                  id="signup-last-name"
                  v-model="signupLastName"
                  data-prose="name"
                  type="text"
                  placeholder="Taylor"
                  autocomplete="family-name"
                  required
                >
              </div>
            </div>
            <div class="fld">
              <label for="signup-email">Email</label>
              <input id="signup-email" v-model="signupEmail" type="email" placeholder="you@gmail.com" autocomplete="email" required>
            </div>
            <div class="fld">
              <label for="signup-password">Password</label>
              <div class="secret-fld">
                <input
                  id="signup-password"
                  v-model="signupPass"
                  :type="reveal.signupPass ? 'text' : 'password'"
                  placeholder="Min. 12 characters"
                  autocomplete="new-password"
                  required
                >
                <button type="button" class="reveal" @click="reveal.signupPass = !reveal.signupPass">
                  {{ reveal.signupPass ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>
            <div class="fld">
              <label for="signup-confirm">Confirm Password</label>
              <div class="secret-fld">
                <input
                  id="signup-confirm"
                  v-model="signupConfirm"
                  :type="reveal.signupConfirm ? 'text' : 'password'"
                  placeholder="Repeat"
                  autocomplete="new-password"
                  required
                >
                <button type="button" class="reveal" @click="reveal.signupConfirm = !reveal.signupConfirm">
                  {{ reveal.signupConfirm ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>
            <div class="fld">
              <label for="signup-type">Role</label>
              <select id="signup-type" v-model="signupType">
                <option>Mechanic</option>
                <option>Accountant</option>
              </select>
            </div>
            <p v-if="error" class="auth-hint auth-error" role="alert">{{ error }}</p>
            <p v-if="notice" class="auth-hint auth-success" role="status">{{ notice }}</p>
            <p class="auth-hint">Requires admin approval.</p>
            <button type="submit" class="btn primary" :disabled="busy" style="width:100%;justify-content:center;margin-top:12px;padding:11px;">
              {{ busy ? 'Submitting…' : 'Submit request' }}
            </button>
          </form>
        </div>
      </div>

      <p v-if="card === 'customer'" class="auth-switch">
        Staff member?
        <button type="button" class="auth-link" @click="card = 'staff'">Open staff portal</button>
      </p>
      <p v-if="card === 'staff'" class="auth-switch">
        Customer account?
        <button type="button" class="auth-link" @click="card = 'customer'">Customer portal</button>
      </p>
      <footer class="suite-foot">© 2015 {{ BRAND_NAME }}. All rights reserved.</footer>
    </div>
  </main>
</template>

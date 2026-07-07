<script setup lang="ts">
const props = defineProps<{
  initialCard?: 'customer' | 'staff'
  initialTab?: 'login' | 'signup'
}>()

const card = ref<'customer' | 'staff'>(props.initialCard ?? 'customer')
const tab = ref<'login' | 'signup'>(props.initialTab ?? 'login')

const auth = useAuthStore()

const portalEmail = ref('')
const portalPass = ref('')
const loginEmail = ref('')
const loginPass = ref('')
const signupName = ref('')
const signupEmail = ref('')
const signupPass = ref('')
const signupConfirm = ref('')
const signupType = ref('Mechanic')

const busy = ref(false)
const error = ref('')
const notice = ref('')

interface FetchError {
  data?: { data?: { message?: string }, message?: string }
}

function messageFrom(err: unknown): string {
  const fe = err as FetchError
  return fe.data?.data?.message ?? fe.data?.message ?? 'Something went wrong — try again'
}

async function submitLogin(email: string, password: string) {
  busy.value = true
  error.value = ''
  try {
    const user = await auth.login(email, password)
    await navigateTo(user.accountType === 'customer' ? '/portal' : '/dashboard')
  }
  catch (err) {
    error.value = messageFrom(err)
  }
  finally {
    busy.value = false
  }
}

async function submitSignup() {
  busy.value = true
  error.value = ''
  notice.value = ''
  if (signupPass.value !== signupConfirm.value) {
    error.value = 'Passwords do not match'
    busy.value = false
    return
  }
  try {
    const res = await $fetch<{ message: string }>('/api/auth/signup', {
      method: 'POST',
      body: {
        name: signupName.value,
        email: signupEmail.value,
        password: signupPass.value,
        accountType: signupType.value.toLowerCase(),
      },
    })
    notice.value = res.message
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
  <div class="auth-screen">
    <div class="auth-wrap">
      <!-- Customer portal card -->
      <div v-show="card === 'customer'" class="auth-card">
        <div class="auth-head">
          <span class="sq">DR</span>
          <b>DORINC</b>
          <small>Customer portal</small>
        </div>
        <div class="auth-body">
          <form @submit.prevent="submitLogin(portalEmail, portalPass)">
            <div class="fld">
              <label>Email</label>
              <input v-model="portalEmail" type="email" autocomplete="username" required>
            </div>
            <div class="fld">
              <label>Password</label>
              <input v-model="portalPass" type="password" autocomplete="current-password" required>
            </div>
            <p v-if="error" class="auth-hint" style="color:#dc2626;">{{ error }}</p>
            <div class="auth-foot"><a href="#">Forgot password?</a></div>
            <button type="submit" class="btn primary" :disabled="busy" style="width:100%;justify-content:center;margin-top:14px;padding:11px;">
              {{ busy ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>
        </div>
      </div>

      <!-- Staff workspace card -->
      <div v-show="card === 'staff'" class="auth-card">
        <div class="auth-head">
          <span class="sq">DR</span>
          <b>DORINC</b>
          <small>Staff workspace</small>
        </div>
        <div class="auth-tabs" role="tablist">
          <button type="button" :class="{ on: tab === 'login' }" @click="tab = 'login'">Sign in</button>
          <button type="button" :class="{ on: tab === 'signup' }" @click="tab = 'signup'">Request account</button>
        </div>
        <div class="auth-panel" :class="{ active: tab === 'login' }">
          <form @submit.prevent="submitLogin(loginEmail, loginPass)">
            <div class="fld">
              <label>Email</label>
              <input v-model="loginEmail" type="email" autocomplete="username" required>
            </div>
            <div class="fld">
              <label>Password</label>
              <input v-model="loginPass" type="password" autocomplete="current-password" required>
            </div>
            <p v-if="error" class="auth-hint" style="color:#dc2626;">{{ error }}</p>
            <div class="auth-foot"><a href="#">Forgot password?</a></div>
            <button type="submit" class="btn primary" :disabled="busy" style="width:100%;justify-content:center;margin-top:14px;padding:11px;">
              {{ busy ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>
        </div>
        <div class="auth-panel" :class="{ active: tab === 'signup' }">
          <form @submit.prevent="submitSignup">
            <div class="fld">
              <label>Full name</label>
              <input v-model="signupName" type="text" placeholder="Jordan T." required>
            </div>
            <div class="fld">
              <label>Work email</label>
              <input v-model="signupEmail" type="email" placeholder="you@dorinc.local" required>
            </div>
            <div class="row2">
              <div class="fld">
                <label>Password</label>
                <input v-model="signupPass" type="password" placeholder="Min. 12 characters" required>
              </div>
              <div class="fld">
                <label>Confirm</label>
                <input v-model="signupConfirm" type="password" placeholder="Repeat" required>
              </div>
            </div>
            <div class="fld">
              <label>Role</label>
              <select v-model="signupType">
                <option>Mechanic</option>
                <option>Accountant</option>
                <option>Viewer</option>
              </select>
            </div>
            <p v-if="error" class="auth-hint" style="color:#dc2626;">{{ error }}</p>
            <p v-if="notice" class="auth-hint" style="color:#059669;">{{ notice }}</p>
            <p class="auth-hint">Requires admin approval.</p>
            <button type="submit" class="btn primary" :disabled="busy" style="width:100%;justify-content:center;margin-top:12px;padding:11px;">
              {{ busy ? 'Submitting…' : 'Submit request' }}
            </button>
          </form>
        </div>
      </div>

      <p v-show="card === 'customer'" class="auth-switch">
        Staff member? <a href="#" @click.prevent="card = 'staff'">Open staff portal</a>
      </p>
      <p v-show="card === 'staff'" class="auth-switch">
        Customer account? <a href="#" @click.prevent="card = 'customer'">Customer portal</a>
      </p>
      <footer class="suite-foot">© 2015 DORINC Suite. All rights reserved.</footer>
    </div>
  </div>
</template>

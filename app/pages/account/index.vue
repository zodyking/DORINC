<script setup lang="ts">
// My account — profile, password, sessions (mockup: PAGE: MY ACCOUNT / P1-35).
import { splitPersonName, toTitleCase } from '#shared/format/person-name'
import {
  formatLastLogin,
  formatMemberSince,
  formatSessionAge,
  sessionDeviceLabel,
  sessionLocation,
  validateNewPassword,
} from '~/utils/account-ui'
import { accountTypeLabel, accountTypePill, avColor, initials } from '~/utils/users-ui'

definePageMeta({ layout: 'staff' })

const auth = useAuthStore()
const route = useRoute()

interface AccountSession {
  id: string
  userAgent: string | null
  ipAddress: string | null
  lastActivityAt: string
  createdAt: string
  isCurrent: boolean
}

interface AccountDetail {
  id: string
  name: string
  email: string
  accountType: string
  memberSince: string
  lastLoginAt: string | null
  activeSessionCount: number
  sessions: AccountSession[]
}

const { data, refresh, error } = await useFetch<{ account: AccountDetail }>('/api/account')

const account = computed(() => data.value?.account)

const profileFirstName = ref('')
const profileLastName = ref('')
const profileEmail = ref('')
const profileBusy = ref(false)
const profileMessage = ref('')
const profileError = ref('')

watch(account, (a) => {
  if (!a) return
  const { firstName, lastName } = splitPersonName(a.name)
  profileFirstName.value = firstName
  profileLastName.value = lastName
  profileEmail.value = a.email
}, { immediate: true })

const currentPassword = ref('')
const newPassword = ref('')
const passwordBusy = ref(false)
const passwordMessage = ref('')
const passwordError = ref('')

const revokeBusy = ref<string | null>(null)
const revokeAllBusy = ref(false)

async function saveProfile() {
  profileBusy.value = true
  profileMessage.value = ''
  profileError.value = ''
  try {
    const firstName = toTitleCase(profileFirstName.value)
    const lastName = toTitleCase(profileLastName.value)
    profileFirstName.value = firstName
    profileLastName.value = lastName
    const res = await $fetch<{ user: { name: string, email: string } }>('/api/account/profile', {
      method: 'PATCH',
      body: {
        firstName,
        lastName,
        email: profileEmail.value.trim(),
      },
    })
    profileMessage.value = 'Profile saved'
    if (auth.user) {
      auth.user = { ...auth.user, name: res.user.name, email: res.user.email }
    }
    await refresh()
  }
  catch (e: unknown) {
    profileError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not save profile'
  }
  finally {
    profileBusy.value = false
  }
}

async function updatePassword() {
  const validation = validateNewPassword(newPassword.value)
  if (validation) {
    passwordError.value = validation
    return
  }

  passwordBusy.value = true
  passwordMessage.value = ''
  passwordError.value = ''
  try {
    await $fetch('/api/account/password', {
      method: 'POST',
      body: { currentPassword: currentPassword.value, newPassword: newPassword.value },
    })
    passwordMessage.value = 'Password updated'
    currentPassword.value = ''
    newPassword.value = ''
  }
  catch (e: unknown) {
    passwordError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not update password'
  }
  finally {
    passwordBusy.value = false
  }
}

async function revokeSession(sessionId: string) {
  revokeBusy.value = sessionId
  try {
    const res = await $fetch<{ revokedCurrent: boolean }>(`/api/account/sessions/${sessionId}/revoke`, {
      method: 'POST',
    })
    if (res.revokedCurrent) {
      await auth.logout()
      return
    }
    await refresh()
  }
  finally {
    revokeBusy.value = null
  }
}

async function revokeAllOtherSessions() {
  revokeAllBusy.value = true
  try {
    await $fetch('/api/account/sessions/revoke-all', { method: 'POST' })
    await refresh()
  }
  finally {
    revokeAllBusy.value = false
  }
}

const displayName = computed(() => account.value?.name ?? auth.user?.name ?? 'Staff')
const avCls = computed(() => avColor(displayName.value))
const avInitials = computed(() => initials(displayName.value))
</script>

<template>
  <section class="page active">
    <div class="pagehead">
      <div>
        <h2>My Account</h2>
        <p>Profile, security and session management for your login</p>
      </div>
    </div>

    <div v-if="error" class="card" style="padding:24px;">
      <p>Sign in to manage your account.</p>
      <NuxtLink :to="`/auth/login?redirect=${encodeURIComponent(route.fullPath)}`" class="btn primary">
        Sign in
      </NuxtLink>
    </div>

    <div v-else-if="account" class="cols">
      <div class="stack">
        <div class="card">
          <div class="chead"><h3>Profile</h3></div>
          <div class="cbody" style="display:flex; gap:18px; align-items:flex-start; flex-wrap:wrap;">
            <span class="av" :class="avCls" style="width:64px; height:64px; border-radius:16px; font-size:20px; flex:none;">
              {{ avInitials }}
            </span>
            <div style="flex:1; min-width:220px;">
              <div class="row2">
                <label class="fld">
                  First name
                  <input
                    v-model="profileFirstName"
                    type="text"
                    autocomplete="given-name"
                    @blur="profileFirstName = toTitleCase(profileFirstName)"
                  >
                </label>
                <label class="fld">
                  Last name
                  <input
                    v-model="profileLastName"
                    type="text"
                    autocomplete="family-name"
                    @blur="profileLastName = toTitleCase(profileLastName)"
                  >
                </label>
              </div>
              <label class="fld">
                Email
                <input v-model="profileEmail" type="email" autocomplete="email">
              </label>
              <p v-if="profileMessage" style="color:#059669; font-size:13px;">{{ profileMessage }}</p>
              <p v-if="profileError" style="color:#dc2626; font-size:13px;">{{ profileError }}</p>
              <button class="btn primary" :disabled="profileBusy" @click="saveProfile">
                {{ profileBusy ? 'Saving…' : 'Save profile' }}
              </button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="chead"><h3>Security</h3></div>
          <div class="cbody">
            <label class="fld">
              Current password
              <input v-model="currentPassword" type="password" placeholder="••••••••••" autocomplete="current-password">
            </label>
            <label class="fld">
              New password
              <input v-model="newPassword" type="password" placeholder="Minimum 12 characters" autocomplete="new-password">
            </label>
            <p v-if="passwordMessage" style="color:#059669; font-size:13px;">{{ passwordMessage }}</p>
            <p v-if="passwordError" style="color:#dc2626; font-size:13px;">{{ passwordError }}</p>
            <button class="btn primary" :disabled="passwordBusy" @click="updatePassword">
              {{ passwordBusy ? 'Updating…' : 'Update password' }}
            </button>
          </div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="chead"><h3>Role &amp; access</h3></div>
          <dl class="kv">
            <dt>Role</dt>
            <dd><span :class="accountTypePill(account.accountType)">{{ accountTypeLabel(account.accountType) }}</span></dd>
            <dt>Member since</dt>
            <dd>{{ formatMemberSince(account.memberSince) }}</dd>
            <dt>Last login</dt>
            <dd>{{ formatLastLogin(account.lastLoginAt) }}</dd>
            <dt>Sessions</dt>
            <dd>{{ account.activeSessionCount }} active</dd>
          </dl>
        </div>

        <div class="card">
          <div class="chead"><h3>Active sessions</h3></div>
          <div
            v-for="session in account.sessions"
            :key="session.id"
            class="userrow"
          >
            <div class="thumb" style="width:38px; height:38px; font-size:15px;">
              {{ session.userAgent?.toLowerCase().includes('iphone') || session.userAgent?.toLowerCase().includes('android') ? '📱' : '💻' }}
            </div>
            <div class="nm">
              <b>{{ sessionDeviceLabel(session.userAgent) }}</b>
              <small>{{ sessionLocation(session.ipAddress, session.isCurrent) }} · {{ formatSessionAge(session.lastActivityAt) }}</small>
            </div>
            <div class="end">
              <span v-if="session.isCurrent" class="pill ok">Current</span>
              <button
                v-else
                class="btn sm danger"
                :disabled="revokeBusy === session.id"
                @click="revokeSession(session.id)"
              >
                Revoke
              </button>
            </div>
          </div>
          <div v-if="account.sessions.length === 0" class="cbody" style="color:#94a3b8; font-size:13px;">
            No other active sessions.
          </div>
          <div v-if="account.activeSessionCount > 1" class="cbody" style="padding-top:10px;">
            <button
              class="btn danger"
              style="width:100%; justify-content:center;"
              :disabled="revokeAllBusy"
              @click="revokeAllOtherSessions"
            >
              {{ revokeAllBusy ? 'Signing out others…' : 'Sign out of all other sessions' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

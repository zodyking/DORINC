<script setup lang="ts">
// Customer portal account — read-only profile, password change (mockup: Portal Account / P2-08).
import { validateNewPassword } from '~/utils/account-ui'
import {
  portalAccountKindLabel,
  portalMustChangePasswordNote,
} from '~/utils/portal-account-ui'
import { portalUserInitials } from '~/utils/portal-dashboard-ui'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const auth = useAuthStore()

interface PortalMePayload {
  user: {
    id: string
    name: string
    email: string
    username: string | null
    mustChangePassword: boolean
  }
  company: {
    id: string
    displayName: string
    accountKind: string
    email: string | null
    phone: string | null
  }
}

const { data, error } = await useFetch<PortalMePayload>('/api/portal/me')

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordBusy = ref(false)
const passwordMessage = ref('')
const passwordError = ref('')

const mustChangeNote = computed(() =>
  portalMustChangePasswordNote(data.value?.user.mustChangePassword ?? false),
)

async function updatePassword() {
  const validation = validateNewPassword(newPassword.value)
  if (validation) {
    passwordError.value = validation
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = 'Passwords do not match'
    return
  }

  passwordBusy.value = true
  passwordMessage.value = ''
  passwordError.value = ''
  try {
    await $fetch('/api/account/password', {
      method: 'POST',
      body: {
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
      },
    })
    passwordMessage.value = 'Password updated'
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  }
  catch (err: unknown) {
    passwordError.value = (err as { data?: { message?: string } })?.data?.message ?? 'Could not update password'
  }
  finally {
    passwordBusy.value = false
  }
}

async function signOut() {
  await auth.logout()
}
</script>

<template>
  <section class="page active">
    <div class="pagehead">
      <div>
        <h2>Account</h2>
        <p>Profile and security for your portal login</p>
      </div>
    </div>

    <div v-if="error" class="card" style="padding:24px;">
      <p>Unable to load account details.</p>
    </div>

    <div v-else-if="data" class="cols">
      <div class="card">
        <div class="chead"><h3>Profile</h3><span class="pill gray">Read-only</span></div>
        <div style="padding:16px 18px;">
          <div style="display:flex; gap:14px; align-items:center; margin-bottom:14px;">
            <span
              class="av"
              style="width:48px; height:48px; border-radius:12px; font-size:16px; flex:none;"
            >
              {{ portalUserInitials(data.user.name) }}
            </span>
            <div>
              <b style="font-size:14px;">{{ data.user.name }}</b>
              <div style="font-size:12px; color:#64748b;">{{ portalAccountKindLabel(data.company.accountKind) }}</div>
            </div>
          </div>
          <label class="fld">
            <span>Name</span>
            <input type="text" :value="data.user.name" readonly style="background:#f1f5f9;">
          </label>
          <label class="fld">
            <span>Username</span>
            <input type="text" :value="data.user.username ?? '—'" readonly style="background:#f1f5f9;">
          </label>
          <label class="fld">
            <span>Email</span>
            <input type="email" :value="data.user.email" readonly style="background:#f1f5f9;">
          </label>
          <label class="fld">
            <span>Company</span>
            <input type="text" :value="data.company.displayName" readonly style="background:#f1f5f9;">
          </label>
          <label class="fld">
            <span>Company email</span>
            <input type="email" :value="data.company.email ?? '—'" readonly style="background:#f1f5f9;">
          </label>
          <label class="fld">
            <span>Company phone</span>
            <input type="text" :value="data.company.phone ?? '—'" readonly style="background:#f1f5f9;">
          </label>
          <p style="font-size:12.5px;color:#64748b;margin:0;">
            Contact the shop to update billing or account contact information.
          </p>
        </div>
      </div>

      <div class="card">
        <div class="chead"><h3>Security</h3></div>
        <div style="padding:16px 18px;">
          <label class="fld">
            <span>Current password</span>
            <input
              v-model="currentPassword"
              type="password"
              autocomplete="current-password"
              placeholder="••••••••••"
            >
          </label>
          <label class="fld">
            <span>New password</span>
            <input
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              placeholder="Minimum 12 characters"
            >
          </label>
          <label class="fld">
            <span>Confirm password</span>
            <input
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
            >
          </label>
          <p
            v-if="mustChangeNote"
            style="font-size:12.5px;color:#64748b;margin:0 0 14px;"
          >
            {{ mustChangeNote }}
          </p>
          <p v-if="passwordMessage" style="color:#059669; font-size:13px;">{{ passwordMessage }}</p>
          <p v-if="passwordError" style="color:#dc2626; font-size:13px;">{{ passwordError }}</p>
          <button class="btn primary" :disabled="passwordBusy" @click="updatePassword">
            {{ passwordBusy ? 'Updating…' : 'Update password' }}
          </button>
          <button
            class="btn danger"
            style="width:100%;justify-content:center;margin-top:14px;"
            @click="signOut"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

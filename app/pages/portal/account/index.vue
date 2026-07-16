<script setup lang="ts">
import { avColor } from '~/utils/users-ui'
import { validateNewPassword } from '~/utils/account-ui'
import {
  portalAccountKindLabel,
  portalMustChangePasswordNote,
} from '~/utils/portal-account-ui'
import { portalUserInitials } from '~/utils/portal-dashboard-ui'
import { phoneDisplay } from '~/utils/phone-ui'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

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

const { data, error } = useClientFetch<PortalMePayload>('/api/portal/me')

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
    const fe = err as { data?: { message?: string, data?: { message?: string } } }
    passwordError.value = fe.data?.data?.message ?? fe.data?.message ?? 'Could not update password'
  }
  finally {
    passwordBusy.value = false
  }
}
</script>

<template>
  <section class="page active portal-page">
    <PortalPageHead subtitle="Your profile and password">
      <template #title>Account</template>
    </PortalPageHead>

    <div v-if="error" class="card">
      <div class="empty">Unable to load account details.</div>
    </div>

    <div v-else-if="data" class="cols">
      <div class="card">
        <div class="chead"><h3>Profile</h3></div>
        <div class="cbody">
          <div class="portal-profile-head">
            <span class="av" :class="avColor(data.user.name)">{{ portalUserInitials(data.user.name) }}</span>
            <div>
              <b>{{ data.user.name }}</b>
              <div class="help">{{ portalAccountKindLabel(data.company.accountKind) }}</div>
            </div>
          </div>
          <label class="fld">
            <span>Username</span>
            <input type="text" :value="data.user.username ?? '—'" readonly>
          </label>
          <label class="fld">
            <span>Email</span>
            <input type="email" :value="data.user.email" readonly>
          </label>
          <label class="fld">
            <span>Company</span>
            <input type="text" :value="data.company.displayName" readonly>
          </label>
          <label class="fld">
            <span>Company phone</span>
            <input type="text" :value="phoneDisplay(data.company.phone)" readonly>
          </label>
          <p class="help">Contact the shop to update billing or company details.</p>
        </div>
      </div>

      <div class="card">
        <div class="chead"><h3>Password</h3></div>
        <div class="cbody">
          <label class="fld">
            <span>Current password</span>
            <input v-model="currentPassword" type="password" autocomplete="current-password">
          </label>
          <label class="fld">
            <span>New password</span>
            <input v-model="newPassword" type="password" autocomplete="new-password" placeholder="Minimum 12 characters">
          </label>
          <label class="fld">
            <span>Confirm password</span>
            <input v-model="confirmPassword" type="password" autocomplete="new-password">
          </label>
          <p v-if="mustChangeNote" class="help">{{ mustChangeNote }}</p>
          <p v-if="passwordMessage" class="callout info">{{ passwordMessage }}</p>
          <p v-if="passwordError" class="help" style="color:#dc2626;">{{ passwordError }}</p>
          <button class="btn primary" :disabled="passwordBusy" @click="updatePassword">
            {{ passwordBusy ? 'Updating…' : 'Update password' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.portal-profile-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}
.portal-profile-head .av {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
  font-size: 14px;
}
.portal-profile-head b {
  display: block;
  font-size: 15px;
}
</style>

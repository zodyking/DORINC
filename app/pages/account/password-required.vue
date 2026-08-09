<script setup lang="ts">
import { validateNewPassword } from '~/utils/account-ui'
import { resolveStaffLandingPath } from '~/utils/staff-route-guard'

definePageMeta({ layout: 'staff' })

const auth = useAuthStore()
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const busy = ref(false)
const errorMsg = ref('')

async function submit() {
  const validation = validateNewPassword(newPassword.value)
  if (validation) {
    errorMsg.value = validation
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    errorMsg.value = 'New passwords do not match'
    return
  }

  busy.value = true
  errorMsg.value = ''
  try {
    await $fetch('/api/account/password', {
      method: 'POST',
      body: {
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
      },
    })
    if (auth.user) {
      auth.user = { ...auth.user, mustChangePassword: false }
    }
    await auth.fetchMe()
    await navigateTo(resolveStaffLandingPath(auth))
  }
  catch (e: unknown) {
    errorMsg.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not update password'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="page active">
    <div class="password-required">
      <div class="card password-required__card">
        <div class="chead">
          <h3>Choose a new password</h3>
        </div>
        <div class="cbody">
          <p class="help" style="margin-top:0;">
            Enter the temporary password from your email, then create a new password to continue.
          </p>
          <label class="fld">
            Temporary / current password
            <input
              v-model="currentPassword"
              type="password"
              autocomplete="current-password"
              :disabled="busy"
            >
          </label>
          <label class="fld">
            New password
            <input
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              placeholder="Minimum 12 characters"
              :disabled="busy"
            >
          </label>
          <label class="fld">
            Confirm new password
            <input
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              :disabled="busy"
            >
          </label>
          <p v-if="errorMsg" class="flash err">{{ errorMsg }}</p>
          <button class="btn primary" style="width:100%;" :disabled="busy" @click="submit">
            {{ busy ? 'Saving…' : 'Save password & continue' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.password-required {
  max-width: 440px;
  margin: 24px auto;
  padding: 0 12px;
}
.password-required__card {
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
</style>

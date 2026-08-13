<script setup lang="ts">
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { isSusanSystemEmail } from '#shared/ai-assistant'
import { formatPhoneDisplay } from '~/utils/phone-ui'
import { normalizePhoneE164 } from '#shared/format/phone-e164'
import { splitPersonName, toTitleCase } from '#shared/format/person-name'

definePageMeta({ layout: 'staff', permission: 'users.read.all' })

interface UserDetail {
  id: string
  name: string
  email: string
  phone: string | null
  accountType: string
  status: string
  emailVerified: boolean
  approvedAt: string | null
  rejectedAt: string | null
  rejectedReason: string | null
  isActive: boolean
  disabledReason: string | null
  mustChangePassword: boolean
  hasLoggedIn: boolean
  teamChatEnabled: boolean
  messageEmailNotify: boolean
  messageNotifyChannel: 'email' | 'sms'
  silentDeveloperMode: boolean
  quoSmsEnabled: boolean
  createdAt: string
}

interface ActivityRow {
  id: string
  action: string
  entityType: string
  entityId: string | null
  createdAt: string
}

interface UserPermissions {
  userId: string
  accountType: { id: string, key: string, name: string }
  roleGrants: string[]
  overrides: {
    allow: Array<{ key: string, reason: string | null, createdAt: string }>
    deny: Array<{ key: string, reason: string | null, createdAt: string }>
  }
  effective: string[]
}

const route = useRoute()
const auth = useAuthStore()
const userId = computed(() => String(route.params.id || ''))

const { data, refresh, error } = useClientFetch<{ user: UserDetail, activity: ActivityRow[] }>(
  () => userId.value ? `/api/admin/users/${userId.value}` : null,
  {
    key: computed(() => adminUserDetailKey(userId.value)),
    watch: [userId],
  },
)

const { data: permData, refresh: refreshPerms } = useClientFetch<UserPermissions>(
  () => userId.value ? `/api/admin/users/${userId.value}/permissions` : null,
  {
    key: computed(() => adminUserPermissionsKey(userId.value)),
    watch: [userId],
  },
)

const user = computed(() => data.value?.user)
const activity = computed(() => data.value?.activity ?? [])
const userPerms = computed(() => permData.value)
const roleGrants = computed(() => userPerms.value?.roleGrants ?? [])

const selectedType = ref('')
const editFirstName = ref('')
const editLastName = ref('')
const editEmail = ref('')
const editPhone = ref('')
const teamChatEnabled = ref(true)
const messageEmailNotify = ref(true)
const messageNotifyChannel = ref<'email' | 'sms'>('email')
const silentDeveloperMode = ref(false)
watchEffect(() => {
  if (user.value) {
    selectedType.value = user.value.accountType
    const { firstName, lastName } = splitPersonName(user.value.name)
    editFirstName.value = firstName
    editLastName.value = lastName
    editEmail.value = user.value.email
    editPhone.value = formatPhoneDisplay(user.value.phone ?? '')
    teamChatEnabled.value = user.value.teamChatEnabled !== false
    messageEmailNotify.value = user.value.messageEmailNotify !== false
    messageNotifyChannel.value = user.value.messageNotifyChannel === 'sms' ? 'sms' : 'email'
    silentDeveloperMode.value = user.value.silentDeveloperMode === true
  }
})

const busy = ref(false)
const notifyBusy = ref(false)
const notice = ref('')
const errorMsg = ref('')

const canManage = computed(() => auth.can('users.manage.all'))
const canEditPerms = computed(() => auth.can('users.permissions.all'))
const isSuperAdminRecord = computed(() => user.value?.accountType === 'super_admin')
const isSusanRecord = computed(() => isSusanSystemEmail(user.value?.email))
const isLockedSystemRecord = computed(() => isSuperAdminRecord.value || isSusanRecord.value)
const quoSmsEnabled = computed(() => user.value?.quoSmsEnabled === true)
const canEditCommunications = computed(() =>
  canManage.value
  && !!user.value
  && !isSusanRecord.value
  && user.value.accountType !== 'customer',
)
const typeDirty = computed(() => !!user.value && selectedType.value !== user.value.accountType)
const nameDirty = computed(() => {
  if (!user.value) return false
  const current = splitPersonName(user.value.name)
  return toTitleCase(editFirstName.value) !== toTitleCase(current.firstName)
    || toTitleCase(editLastName.value) !== toTitleCase(current.lastName)
})
const emailDirty = computed(() => {
  if (!user.value) return false
  return editEmail.value.trim().toLowerCase() !== user.value.email.trim().toLowerCase()
})
const phoneDirty = computed(() => {
  if (!user.value) return false
  const next = normalizePhoneE164(editPhone.value) ?? (editPhone.value.trim() || null)
  const current = normalizePhoneE164(user.value.phone) ?? (user.value.phone?.trim() || null)
  return next !== current
})
const profileDirty = computed(() =>
  typeDirty.value || nameDirty.value || emailDirty.value || phoneDirty.value,
)
const canEditProfileFields = computed(() => canManage.value && !isSusanRecord.value)
const communicationsDirty = computed(() => {
  if (!user.value) return false
  const currentChannel = user.value.messageNotifyChannel === 'sms' ? 'sms' : 'email'
  return teamChatEnabled.value !== (user.value.teamChatEnabled !== false)
    || messageEmailNotify.value !== (user.value.messageEmailNotify !== false)
    || messageNotifyChannel.value !== currentChannel
    || silentDeveloperMode.value !== (user.value.silentDeveloperMode === true)
})

// Permission override state: 'inherit' | 'allow' | 'deny'
type OverrideState = 'inherit' | 'allow' | 'deny'
const overrideStates = ref<Record<string, OverrideState>>({})

watchEffect(() => {
  if (userPerms.value) {
    const states: Record<string, OverrideState> = {}
    for (const o of userPerms.value.overrides.allow) {
      states[o.key] = 'allow'
    }
    for (const o of userPerms.value.overrides.deny) {
      states[o.key] = 'deny'
    }
    overrideStates.value = states
  }
})

const permissionsDirty = computed(() => {
  if (!userPerms.value) return false
  const currentAllow = new Set(userPerms.value.overrides.allow.map(o => o.key))
  const currentDeny = new Set(userPerms.value.overrides.deny.map(o => o.key))
  
  for (const [key, state] of Object.entries(overrideStates.value)) {
    if (state === 'allow' && !currentAllow.has(key)) return true
    if (state === 'deny' && !currentDeny.has(key)) return true
    if (state === 'inherit' && (currentAllow.has(key) || currentDeny.has(key))) return true
  }
  
  for (const key of currentAllow) {
    if (overrideStates.value[key] !== 'allow') return true
  }
  for (const key of currentDeny) {
    if (overrideStates.value[key] !== 'deny') return true
  }
  
  return false
})

function getOverrideState(key: string): OverrideState {
  return overrideStates.value[key] ?? 'inherit'
}

function setOverrideState(key: string, state: OverrideState) {
  if (!canEditPerms.value || isLockedSystemRecord.value) return
  if (state === 'inherit') {
    const { [key]: _, ...rest } = overrideStates.value
    overrideStates.value = rest
  } else {
    overrideStates.value = { ...overrideStates.value, [key]: state }
  }
}

function cycleOverrideState(key: string) {
  const current = getOverrideState(key)
  const next: OverrideState = current === 'inherit' ? 'allow' : current === 'allow' ? 'deny' : 'inherit'
  setOverrideState(key, next)
}

function messageFrom(err: unknown): string {
  return syncFetchErrorMessage(err, 'Something went wrong — try again')
}

async function run(action: () => Promise<unknown>, successNote: string) {
  busy.value = true
  errorMsg.value = ''
  notice.value = ''
  try {
    await action()
    bustAdminUsersCache()
    await refresh()
    await refreshPerms()
    notice.value = successNote
  }
  catch (err) {
    errorMsg.value = messageFrom(err)
  }
  finally {
    busy.value = false
  }
}

const saveChanges = () => run(
  async () => {
    const firstName = toTitleCase(editFirstName.value)
    const lastName = toTitleCase(editLastName.value)
    if (nameDirty.value) {
      editFirstName.value = firstName
      editLastName.value = lastName
    }
    await $fetch(`/api/admin/users/${route.params.id}`, {
      method: 'PATCH',
      body: {
        ...(typeDirty.value ? { accountType: selectedType.value } : {}),
        ...(nameDirty.value ? { firstName, lastName } : {}),
        ...(emailDirty.value ? { email: editEmail.value.trim() } : {}),
        ...(phoneDirty.value ? { phone: editPhone.value.trim() || null } : {}),
      },
    })
  },
  (() => {
    const onlyPhone = phoneDirty.value && !typeDirty.value && !nameDirty.value && !emailDirty.value
    const onlyType = typeDirty.value && !phoneDirty.value && !nameDirty.value && !emailDirty.value
    const onlyName = nameDirty.value && !typeDirty.value && !phoneDirty.value && !emailDirty.value
    const onlyEmail = emailDirty.value && !typeDirty.value && !phoneDirty.value && !nameDirty.value
    if (onlyPhone) return 'Phone number updated'
    if (onlyType) return 'Account type updated'
    if (onlyName) return 'Name updated'
    if (onlyEmail) return 'Email updated'
    return 'User updated'
  })(),
)

async function saveCommunications() {
  if (!canEditCommunications.value || !user.value) return
  notifyBusy.value = true
  errorMsg.value = ''
  notice.value = ''
  try {
    const res = await $fetch<{ channelChanged?: boolean }>(
      `/api/admin/users/${route.params.id}/notifications`,
      {
        method: 'PATCH',
        body: {
          teamChatEnabled: teamChatEnabled.value,
          silentDeveloperMode: silentDeveloperMode.value,
          ...(quoSmsEnabled.value
            ? { messageNotifyChannel: messageNotifyChannel.value }
            : { messageEmailNotify: messageEmailNotify.value }),
        },
      },
    )
    bustAdminUsersCache()
    await refresh()
    notice.value = res.channelChanged
      ? `Communication settings saved — user notified by ${messageNotifyChannel.value === 'sms' ? 'text' : 'email'}`
      : 'Communication settings saved'
  }
  catch (err) {
    errorMsg.value = messageFrom(err)
  }
  finally {
    notifyBusy.value = false
  }
}

function toggleActive() {
  if (user.value!.isActive) {
    // Deactivating - prompt for reason
    const reason = window.prompt('Suspend this user? Enter a reason (optional):')
    if (reason === null) return // Cancelled
    void run(
      () => $fetch(`/api/admin/users/${route.params.id}`, {
        method: 'PATCH',
        body: { isActive: false, disabledReason: reason || undefined },
      }),
      reason ? 'User suspended' : 'User deactivated',
    )
  } else {
    // Reactivating
    void run(
      () => $fetch(`/api/admin/users/${route.params.id}`, {
        method: 'PATCH',
        body: { isActive: true },
      }),
      'User reactivated',
    )
  }
}

const approve = () => run(
  () => $fetch(`/api/admin/users/${route.params.id}/approve`, {
    method: 'POST',
    body: typeDirty.value ? { accountType: selectedType.value } : {},
  }),
  'User approved',
)

function rejectUser() {
  const reason = window.prompt('Reject this signup? Enter a reason:')
  if (!reason) return
  void run(
    () => $fetch(`/api/admin/users/${route.params.id}/reject`, {
      method: 'POST',
      body: { reason },
    }),
    'Signup rejected',
  )
}

const resendVerification = () => run(
  () => $fetch(`/api/admin/users/${route.params.id}/resend-verification`, {
    method: 'POST',
  }),
  'Verification email sent',
)

const resendInvite = () => run(
  () => $fetch(`/api/admin/users/${route.params.id}/resend-invite`, {
    method: 'POST',
  }),
  'Invite email sent with a new temporary password',
)

const sendPasswordReset = () => run(
  () => $fetch(`/api/admin/users/${route.params.id}/password-reset`, {
    method: 'POST',
  }),
  'Temporary password emailed — user must set a new password on next sign-in',
)

const showSetPasswordModal = ref(false)
const setPasswordValue = ref('')
const setPasswordConfirm = ref('')
const setPasswordMustChange = ref(true)
const setPasswordError = ref('')

function openSetPassword() {
  setPasswordValue.value = ''
  setPasswordConfirm.value = ''
  setPasswordMustChange.value = true
  setPasswordError.value = ''
  showSetPasswordModal.value = true
}

function closeSetPassword() {
  showSetPasswordModal.value = false
  setPasswordValue.value = ''
  setPasswordConfirm.value = ''
  setPasswordError.value = ''
}

async function submitSetPassword() {
  const password = setPasswordValue.value
  if (password.length < 12) {
    setPasswordError.value = 'Password must be at least 12 characters'
    return
  }
  if (password !== setPasswordConfirm.value) {
    setPasswordError.value = 'Passwords do not match'
    return
  }
  await run(
    () => $fetch(`/api/admin/users/${route.params.id}/set-password`, {
      method: 'POST',
      body: {
        password,
        mustChangePassword: setPasswordMustChange.value,
      },
    }),
    setPasswordMustChange.value
      ? 'Password set — sign in as this user, then they must choose a new password'
      : 'Password set — you can sign in as this user now',
  )
  if (!errorMsg.value) closeSetPassword()
}

const canResendVerification = computed(() =>
  canManage.value
  && user.value
  && !isSusanRecord.value
  && !user.value.emailVerified
  && user.value.accountType !== 'customer'
  && user.value.isActive
  && user.value.status !== 'rejected'
)

const canCredentialAction = computed(() =>
  canManage.value
  && user.value
  && !isSusanRecord.value
  && user.value.accountType !== 'customer'
  && user.value.accountType !== 'super_admin'
  && user.value.isActive
  && user.value.status !== 'rejected'
)

/** Never signed in yet → resend invite. Password reset and set-password work even before first login. */
const canResendInvite = computed(() => canCredentialAction.value && !user.value?.hasLoggedIn)
const canPasswordReset = computed(() => canCredentialAction.value)
const canSetPassword = computed(() => canCredentialAction.value)

const canDelete = computed(() =>
  canManage.value
  && user.value
  && !isSusanRecord.value
  && user.value.accountType !== 'super_admin'
)

const showDeleteModal = ref(false)
const deleteConfirmEmail = ref('')
const deleteReason = ref('')
const deleteBusy = ref(false)
const deleteError = ref('')

async function deleteUser() {
  if (!user.value || deleteConfirmEmail.value.toLowerCase() !== user.value.email.toLowerCase()) {
    deleteError.value = 'Email does not match'
    return
  }
  
  deleteBusy.value = true
  deleteError.value = ''
  
  try {
    await $fetch(`/api/admin/users/${route.params.id}`, {
      method: 'DELETE',
      body: {
        confirmEmail: deleteConfirmEmail.value,
        reason: deleteReason.value || undefined,
      },
    })
    bustAdminUsersCache()
    await navigateTo('/users')
  }
  catch (err) {
    const data = (err as { data?: { message?: string, details?: { dependents?: string[] } } })?.data
    const dependents = data?.details?.dependents
    if (dependents?.length) {
      deleteError.value = `Cannot delete: ${dependents.join(', ')}`
    }
    else {
      deleteError.value = syncFetchErrorMessage(err, 'Failed to delete user')
    }
  }
  finally {
    deleteBusy.value = false
  }
}

async function savePermissions() {
  const allow: string[] = []
  const deny: string[] = []

  for (const [key, state] of Object.entries(overrideStates.value)) {
    if (state === 'allow') allow.push(key)
    if (state === 'deny') deny.push(key)
  }

  await run(
    () => $fetch(`/api/admin/users/${route.params.id}/permissions`, {
      method: 'PUT',
      body: { allow, deny },
    }),
    'Permission overrides saved',
  )
}

async function savePermissionsAndClose() {
  await savePermissions()
  if (!errorMsg.value) showPermissionsModal.value = false
}

function joinedLabel(iso: string | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

function activityWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function activityTitle(a: ActivityRow): string {
  const map: Record<string, string> = {
    'auth.login': 'Login',
    'auth.logout': 'Logout',
    'auth.signup': 'Signed up',
    'auth.bootstrap_super_admin': 'Completed first-run setup',
    'users.approve': 'Approved a user',
    'users.reject': 'Rejected a user',
    'users.update': 'Updated a user',
    'users.permissions.update': 'Updated permissions',
    'users.password_reset': 'Password reset emailed',
    'users.password_set': 'Password set by admin',
    'users.invite': 'Invited',
    'users.invite_resend': 'Invite resent',
  }
  return map[a.action] ?? a.action
}

const showPermissionsModal = ref(false)
</script>

<template>
  <section class="page active">
    <div v-if="error" class="card" style="padding:32px; text-align:center; color:#64748b;">
      User not found. <NuxtLink to="/users">Back to users</NuxtLink>
    </div>

    <template v-else-if="user">
      <StaffPageHead>
        <template #title>
          {{ user.name }}
          <span :class="accountTypePill(user.accountType)" style="vertical-align:3px">{{ accountTypeLabel(user.accountType) }}</span>
        </template>
        <template #subtitle>
          <NuxtLink to="/users">Users</NuxtLink> / {{ user.email }} · joined {{ joinedLabel(user.createdAt) }}
        </template>
        <template #actions>
          <template v-if="isSusanRecord">
            <span class="pill gray">System account · locked</span>
          </template>
          <template v-else-if="user.status === 'pending' && canManage">
            <button class="btn" :disabled="busy" @click="rejectUser">Reject</button>
            <button class="btn primary" :disabled="busy" @click="approve">Approve</button>
          </template>
          <template v-else>
            <button
              v-if="canResendInvite"
              class="btn"
              :disabled="busy"
              @click="resendInvite"
            >
              Resend invite
            </button>
            <button
              v-if="canSetPassword"
              class="btn"
              :disabled="busy"
              @click="openSetPassword"
            >
              Set password
            </button>
            <button
              v-if="canPasswordReset"
              class="btn"
              :disabled="busy"
              @click="sendPasswordReset"
            >
              Password Reset
            </button>
            <button
              v-if="canResendVerification"
              class="btn"
              :disabled="busy"
              @click="resendVerification"
            >
              Resend verification
            </button>
            <button
              v-if="canManage && !isLockedSystemRecord"
              class="btn"
              :disabled="busy"
              @click="toggleActive"
            >
              {{ user.isActive ? 'Deactivate' : 'Reactivate' }}
            </button>
            <button
              v-if="canManage && !isSusanRecord"
              class="btn primary"
              :disabled="busy || !profileDirty"
              @click="saveChanges"
            >
              Save changes
            </button>
            <button
              v-if="canDelete"
              class="btn danger"
              :disabled="busy"
              @click="showDeleteModal = true"
            >
              Delete
            </button>
          </template>
        </template>
      </StaffPageHead>

      <p v-if="isSusanRecord" class="flash warn">
        Susan’s system account cannot be edited, deactivated, or deleted — not even by an admin.
      </p>
      <p v-if="errorMsg" class="flash err">{{ errorMsg }}</p>
      <p v-if="notice" class="flash ok">{{ notice }}</p>

      <div class="cols">
        <div class="stack">
          <div class="card">
            <div class="chead"><h3>Profile</h3></div>
            <div class="cbody" style="display:flex; gap:18px; align-items:flex-start; flex-wrap:wrap;">
              <span
                class="av"
                :class="avColor(user.name)"
                style="width:64px; height:64px; border-radius:16px; font-size:20px; flex:none;"
              >{{ initials(user.name) }}</span>
              <div style="flex:1; min-width:220px;">
                <div class="row2">
                  <label class="fld">
                    First name
                    <input
                      v-model="editFirstName"
                      type="text"
                      autocomplete="given-name"
                      :readonly="!canEditProfileFields"
                      :disabled="busy || isSusanRecord"
                      @blur="editFirstName = toTitleCase(editFirstName)"
                    >
                  </label>
                  <label class="fld">
                    Last name
                    <input
                      v-model="editLastName"
                      type="text"
                      autocomplete="family-name"
                      :readonly="!canEditProfileFields"
                      :disabled="busy || isSusanRecord"
                      @blur="editLastName = toTitleCase(editLastName)"
                    >
                  </label>
                </div>
                <label class="fld">
                  Email
                  <input
                    v-model="editEmail"
                    type="email"
                    autocomplete="email"
                    :readonly="!canEditProfileFields"
                    :disabled="busy || isSusanRecord"
                  >
                </label>
                <label class="fld">
                  Phone number
                  <input
                    v-model="editPhone"
                    type="tel"
                    autocomplete="tel"
                    placeholder="(212) 203 7378"
                    :readonly="!canEditProfileFields"
                    :disabled="busy || isSusanRecord"
                    @blur="editPhone = formatPhoneDisplay(editPhone)"
                  >
                  <span class="help">Always available for admins to set. Format like (212) 203 7378. Used for text alerts when Quo SMS is enabled.</span>
                </label>
                <label class="fld">Email verified
                  <input type="text" :value="user.emailVerified ? 'Yes' : 'No'" readonly>
                  <span class="help">Verified only after this account confirms the mailbox — not reused from a deleted account on the same email.</span>
                </label>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="chead">
              <h3>Permissions</h3>
              <div class="right">
                <button v-if="canEditPerms && !isLockedSystemRecord" class="btn sm" @click="showPermissionsModal = true">
                  Edit overrides
                </button>
              </div>
            </div>
            <div class="cbody perm-summary-body">
              <PermissionMatrixTable
                v-if="userPerms"
                :role-grants="roleGrants"
                :override-states="overrideStates"
                mode="readonly"
                compact
                :show-nav-hint="false"
              />
              <p class="perm-summary-foot">
                Base permissions from {{ accountTypeLabel(user.accountType) }} role.
                <template v-if="userPerms?.overrides.allow.length || userPerms?.overrides.deny.length">
                  {{ userPerms?.overrides.allow.length || 0 }} allow override(s),
                  {{ userPerms?.overrides.deny.length || 0 }} deny override(s).
                </template>
              </p>
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="chead"><h3>Account</h3></div>
            <dl class="kv">
              <dt>Account type</dt>
              <dd>
                <select
                  v-model="selectedType"
                  :disabled="!canManage || isLockedSystemRecord || busy"
                  style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font:inherit"
                >
                  <option v-if="isSuperAdminRecord" value="super_admin">Super Admin</option>
                  <option v-if="isSusanRecord" :value="user.accountType">{{ accountTypeLabel(user.accountType) }}</option>
                  <option value="mechanic">Mechanic</option>
                  <option value="accountant">Accountant</option>
                  <option value="viewer">Viewer</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="external_auditor">External Auditor</option>
                </select>
              </dd>
              <dt>Status</dt>
              <dd><span :class="statusPill(user.status)">{{ statusLabel(user.status) }}</span></dd>
              <dt v-if="user.rejectedReason">Rejection reason</dt>
              <dd v-if="user.rejectedReason">{{ user.rejectedReason }}</dd>
              <dt v-if="user.disabledReason">Suspension reason</dt>
              <dd v-if="user.disabledReason">{{ user.disabledReason }}</dd>
              <dt>Joined</dt>
              <dd>{{ new Date(user.createdAt).toLocaleDateString() }}</dd>
            </dl>
          </div>
          <div v-if="canEditCommunications" class="card">
            <div class="chead"><h3>Messages</h3></div>
            <div class="cbody">
              <div class="msg-prefs">
                <div class="msg-pref-row msg-pref-row--channel">
                  <span class="msg-pref-text">
                    <b>Team group chat</b>
                    <small>Stay in the shared Team channel for internal workflow updates.</small>
                  </span>
                  <div class="notify-channel" role="group" aria-label="Team group chat">
                    <button
                      type="button"
                      class="notify-channel__opt"
                      :class="{ on: teamChatEnabled }"
                      :disabled="notifyBusy || busy"
                      @click="teamChatEnabled = true"
                    >
                      On
                    </button>
                    <button
                      type="button"
                      class="notify-channel__opt"
                      :class="{ on: !teamChatEnabled }"
                      :disabled="notifyBusy || busy"
                      @click="teamChatEnabled = false"
                    >
                      Off
                    </button>
                  </div>
                </div>
                <div v-if="quoSmsEnabled" class="msg-pref-row msg-pref-row--channel">
                  <span class="msg-pref-text">
                    <b>Security &amp; chat notifications</b>
                    <small>
                      Choose Email or Text for staff notifications. Changing this notifies the user on the new channel.
                      Text requires a phone number on their profile.
                    </small>
                  </span>
                  <div class="notify-channel" role="group" aria-label="Notification channel">
                    <button
                      type="button"
                      class="notify-channel__opt"
                      :class="{ on: messageNotifyChannel === 'email' }"
                      :disabled="notifyBusy || busy"
                      @click="messageNotifyChannel = 'email'"
                    >
                      Email
                    </button>
                    <button
                      type="button"
                      class="notify-channel__opt"
                      :class="{ on: messageNotifyChannel === 'sms' }"
                      :disabled="notifyBusy || busy"
                      @click="messageNotifyChannel = 'sms'"
                    >
                      Text
                    </button>
                  </div>
                </div>
                <div v-else class="msg-pref-row msg-pref-row--channel">
                  <span class="msg-pref-text">
                    <b>Email me for new chat messages</b>
                    <small>Send an email when they receive a direct message or a team chat message.</small>
                  </span>
                  <div class="notify-channel" role="group" aria-label="Email me for new chat messages">
                    <button
                      type="button"
                      class="notify-channel__opt"
                      :class="{ on: messageEmailNotify }"
                      :disabled="notifyBusy || busy"
                      @click="messageEmailNotify = true"
                    >
                      On
                    </button>
                    <button
                      type="button"
                      class="notify-channel__opt"
                      :class="{ on: !messageEmailNotify }"
                      :disabled="notifyBusy || busy"
                      @click="messageEmailNotify = false"
                    >
                      Off
                    </button>
                  </div>
                </div>
                <div class="msg-pref-row msg-pref-row--channel msg-pref-row--dev">
                  <span class="msg-pref-text">
                    <b>Silent developer mode</b>
                    <small>
                      When enabled, workflow notifications this user triggers are not sent to other users.
                    </small>
                  </span>
                  <div class="notify-channel" role="group" aria-label="Silent developer mode">
                    <button
                      type="button"
                      class="notify-channel__opt"
                      :class="{ on: silentDeveloperMode }"
                      :disabled="notifyBusy || busy"
                      @click="silentDeveloperMode = true"
                    >
                      On
                    </button>
                    <button
                      type="button"
                      class="notify-channel__opt"
                      :class="{ on: !silentDeveloperMode }"
                      :disabled="notifyBusy || busy"
                      @click="silentDeveloperMode = false"
                    >
                      Off
                    </button>
                  </div>
                </div>
              </div>
              <button
                class="btn primary msg-pref-save"
                :disabled="notifyBusy || busy || !communicationsDirty"
                @click="saveCommunications"
              >
                {{ notifyBusy ? 'Saving…' : 'Save message preferences' }}
              </button>
            </div>
          </div>
          <div class="card">
            <div class="chead"><h3>Recent activity</h3></div>
            <div v-if="activity.length" class="timeline">
              <div v-for="(a, i) in activity" :key="a.id" class="tl" :class="{ hot: i === 0 }">
                <b>{{ activityTitle(a) }}</b>
                <span>{{ activityWhen(a.createdAt) }} · {{ a.entityType }}</span>
              </div>
            </div>
            <div v-else class="empty" style="display:block;">
              No recorded activity yet.
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Set Password Modal -->
    <Teleport to="body">
      <div v-if="showSetPasswordModal" class="modal-backdrop" @click.self="closeSetPassword">
        <div class="modal set-password-modal" role="dialog" aria-labelledby="set-password-title">
          <div class="modal-header">
            <h2 id="set-password-title">Set password</h2>
            <button class="close-btn" type="button" aria-label="Close" @click="closeSetPassword">&times;</button>
          </div>
          <div class="modal-body">
            <p class="set-password-lead">
              Set a known password so you can sign in as {{ user?.name || 'this user' }} for testing.
              Their other sessions will be signed out.
            </p>
            <p v-if="setPasswordError" class="flash err">{{ setPasswordError }}</p>
            <label class="fld">
              New password
              <input
                v-model="setPasswordValue"
                type="password"
                autocomplete="new-password"
                minlength="12"
                maxlength="200"
                :disabled="busy"
              >
              <span class="help">At least 12 characters.</span>
            </label>
            <label class="fld">
              Confirm password
              <input
                v-model="setPasswordConfirm"
                type="password"
                autocomplete="new-password"
                minlength="12"
                maxlength="200"
                :disabled="busy"
                @keyup.enter="submitSetPassword"
              >
            </label>
            <label class="set-password-check">
              <input v-model="setPasswordMustChange" type="checkbox" :disabled="busy">
              Require a new password after they sign in
            </label>
          </div>
          <div class="modal-footer">
            <button class="btn" type="button" :disabled="busy" @click="closeSetPassword">Cancel</button>
            <button class="btn primary" type="button" :disabled="busy" @click="submitSetPassword">
              {{ busy ? 'Saving…' : 'Set password' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete User Modal -->
    <Teleport to="body">
      <div v-if="showDeleteModal" class="modal-backdrop" @click.self="showDeleteModal = false">
        <div class="modal" role="dialog" aria-labelledby="delete-modal-title">
          <div class="modal-header">
            <h2 id="delete-modal-title">Delete user permanently</h2>
            <button class="close-btn" aria-label="Close" @click="showDeleteModal = false">&times;</button>
          </div>
          <div class="modal-body">
            <p class="delete-warning">
              This action is <b>irreversible</b>. The user account and all associated data will be permanently deleted.
            </p>
            <p v-if="deleteError" class="flash err">{{ deleteError }}</p>
            <label class="fld">
              Reason for deletion (optional)
              <input
                v-model="deleteReason"
                type="text"
                placeholder="e.g. Duplicate account, requested by user"
                maxlength="500"
              >
            </label>
            <label class="fld">
              To confirm, type the user's email: <b>{{ user?.email }}</b>
              <input
                v-model="deleteConfirmEmail"
                type="email"
                placeholder="Enter email to confirm"
              >
            </label>
          </div>
          <div class="modal-footer">
            <button class="btn" :disabled="deleteBusy" @click="showDeleteModal = false">Cancel</button>
            <button
              class="btn danger"
              :disabled="deleteBusy || deleteConfirmEmail.toLowerCase() !== user?.email?.toLowerCase()"
              @click="deleteUser"
            >
              {{ deleteBusy ? 'Deleting...' : 'Delete permanently' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Permissions Override Modal -->
    <Teleport to="body">
      <div v-if="showPermissionsModal" class="modal-backdrop" @click.self="showPermissionsModal = false">
        <div class="modal perm-modal" role="dialog" aria-labelledby="perm-modal-title">
          <div class="modal-header">
            <h2 id="perm-modal-title">Edit permission overrides</h2>
            <button class="close-btn" aria-label="Close" @click="showPermissionsModal = false">&times;</button>
          </div>
          <div class="modal-body perm-modal-body">
            <PermissionMatrixTable
              :role-grants="roleGrants"
              :override-states="overrideStates"
              mode="editable"
              @cycle="cycleOverrideState"
            />
          </div>
          <div class="modal-footer">
            <button class="btn" @click="showPermissionsModal = false">Cancel</button>
            <button
              class="btn primary"
              :disabled="busy || !permissionsDirty"
              @click="savePermissionsAndClose()"
            >
              {{ busy ? 'Saving...' : 'Save overrides' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.flash {
  margin: -8px 0 14px;
  font-size: 13px;
  font-weight: 500;
}
.flash.err {
  color: #dc2626;
}
.flash.ok {
  color: #059669;
}

.perm-summary-body {
  padding-top: 8px !important;
  padding-bottom: 8px !important;
}

.perm-summary-foot {
  font-size: 12px;
  color: #94a3b8;
  margin: 10px 0 0;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.perm-modal {
  width: 100%;
  max-width: 860px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.modal-header h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #64748b;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: #0f172a;
}

.perm-modal-body {
  overflow-y: auto;
  padding: 16px 20px;
  flex: 1;
  min-height: 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.btn.danger {
  background: #dc2626;
  color: #fff;
  border-color: #dc2626;
}

.btn.danger:hover:not(:disabled) {
  background: #b91c1c;
  border-color: #b91c1c;
}

.btn.danger:disabled {
  opacity: 0.5;
}

.delete-warning {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 12px 16px;
  color: #991b1b;
  font-size: 13px;
  margin-bottom: 16px;
}

.set-password-modal {
  width: 100%;
  max-width: 440px;
}

.set-password-modal .modal-body {
  padding: 16px 20px;
}

.set-password-lead {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.45;
  color: #475569;
}

.set-password-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
  color: #0f172a;
  cursor: pointer;
}

.set-password-check input {
  margin-top: 2px;
}

@media (max-width: 720px) {
  .modal-backdrop {
    align-items: stretch;
    padding: 0;
  }

  .perm-modal {
    max-width: none;
    width: 100%;
    max-height: none;
    height: 100dvh;
    border-radius: 0;
  }
}

.msg-prefs {
  display: flex;
  flex-direction: column;
}
.msg-pref-row {
  display: flex;
  gap: 14px;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #f1f5f9;
}
.msg-pref-row--channel {
  cursor: default;
  align-items: center;
}
.notify-channel {
  display: inline-flex;
  flex-shrink: 0;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  overflow: hidden;
  background: #f8fafc;
}
.notify-channel__opt {
  border: 0;
  background: transparent;
  padding: 8px 14px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  min-height: 36px;
}
.notify-channel__opt.on {
  background: #0f172a;
  color: #fff;
}
.notify-channel__opt:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
.msg-pref-row:first-child {
  padding-top: 0;
}
.msg-pref-row:last-child {
  border-bottom: none;
}
.msg-pref-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.msg-pref-text b {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}
.msg-pref-text small {
  color: #64748b;
  font-size: 12.5px;
  line-height: 1.45;
}
.msg-pref-row--dev {
  background: #fafafa;
  margin: 0 -16px;
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
}
.msg-pref-row--dev:last-child {
  border-bottom: none;
}
.msg-pref-save {
  margin-top: 14px;
}
</style>

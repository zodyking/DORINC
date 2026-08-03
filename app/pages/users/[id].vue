<script setup lang="ts">
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

definePageMeta({ layout: 'staff', permission: 'users.read.all' })

interface UserDetail {
  id: string
  name: string
  email: string
  accountType: string
  status: string
  emailVerified: boolean
  approvedAt: string | null
  rejectedAt: string | null
  rejectedReason: string | null
  isActive: boolean
  disabledReason: string | null
  mustChangePassword: boolean
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

const { data, refresh, error } = useClientFetch<{ user: UserDetail, activity: ActivityRow[] }>(
  `/api/admin/users/${route.params.id}`,
)

const { data: permData, refresh: refreshPerms } = useClientFetch<UserPermissions>(
  `/api/admin/users/${route.params.id}/permissions`,
)

const user = computed(() => data.value?.user)
const activity = computed(() => data.value?.activity ?? [])
const userPerms = computed(() => permData.value)
const roleGrants = computed(() => userPerms.value?.roleGrants ?? [])

const selectedType = ref('')
watchEffect(() => {
  if (user.value) selectedType.value = user.value.accountType
})

const busy = ref(false)
const notice = ref('')
const errorMsg = ref('')

const canManage = computed(() => auth.can('users.manage.all'))
const canEditPerms = computed(() => auth.can('users.permissions.all'))
const isSuperAdminRecord = computed(() => user.value?.accountType === 'super_admin')
const typeDirty = computed(() => !!user.value && selectedType.value !== user.value.accountType)

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
  if (!canEditPerms.value || isSuperAdminRecord.value) return
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
  () => $fetch(`/api/admin/users/${route.params.id}`, {
    method: 'PATCH',
    body: { accountType: selectedType.value },
  }),
  'Account type updated',
)

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

const canResendVerification = computed(() =>
  canManage.value
  && user.value
  && !user.value.emailVerified
  && user.value.accountType !== 'customer'
  && user.value.isActive
  && user.value.status !== 'rejected'
)

const canResendInvite = computed(() =>
  canManage.value
  && user.value
  && user.value.accountType !== 'customer'
  && user.value.accountType !== 'super_admin'
  && user.value.isActive
  && user.value.status !== 'rejected'
)

const canDelete = computed(() =>
  canManage.value
  && user.value
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
          <template v-if="user.status === 'pending' && canManage">
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
              v-if="canResendVerification"
              class="btn"
              :disabled="busy"
              @click="resendVerification"
            >
              Resend verification
            </button>
            <button
              v-if="canManage && !isSuperAdminRecord"
              class="btn"
              :disabled="busy"
              @click="toggleActive"
            >
              {{ user.isActive ? 'Deactivate' : 'Reactivate' }}
            </button>
            <button
              v-if="canManage && !isSuperAdminRecord"
              class="btn primary"
              :disabled="busy || !typeDirty"
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
                <label class="fld">Full name <input type="text" :value="user.name" readonly></label>
                <label class="fld">Email <input type="email" :value="user.email" readonly></label>
                <label class="fld">Email verified
                  <input type="text" :value="user.emailVerified ? 'Yes' : 'No'" readonly>
                </label>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="chead">
              <h3>Permissions</h3>
              <div class="right">
                <button v-if="canEditPerms && !isSuperAdminRecord" class="btn sm" @click="showPermissionsModal = true">
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
                  :disabled="!canManage || isSuperAdminRecord || busy"
                  style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font:inherit"
                >
                  <option v-if="isSuperAdminRecord" value="super_admin">Super Admin</option>
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
          <div v-if="canManage && user && user.accountType !== 'customer'" class="card">
            <div class="chead"><h3>Training</h3></div>
            <div class="cbody">
              <p class="help" style="margin-top:0;">
                Assign interactive modules. Locked assignments restrict the user to Training until complete.
              </p>
              <TrainingAssignPanel
                :user-id="user.id"
                :user-name="user.name"
              />
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
</style>

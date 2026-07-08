<script setup lang="ts">
import { ACCOUNT_TYPE_BUNDLES } from '#shared/permissions/keys'

definePageMeta({ layout: 'staff' })

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
  createdAt: string
}

interface ActivityRow {
  id: string
  action: string
  entityType: string
  entityId: string | null
  createdAt: string
}

const route = useRoute()
const auth = useAuthStore()

const { data, refresh, error } = await useFetch<{ user: UserDetail, activity: ActivityRow[] }>(
  `/api/admin/users/${route.params.id}`,
)

const user = computed(() => data.value?.user)
const activity = computed(() => data.value?.activity ?? [])

const selectedType = ref('')
watchEffect(() => {
  if (user.value) selectedType.value = user.value.accountType
})

const busy = ref(false)
const notice = ref('')
const errorMsg = ref('')

const canManage = computed(() => auth.can('users.manage.all'))
const isSuperAdminRecord = computed(() => user.value?.accountType === 'super_admin')
const typeDirty = computed(() => !!user.value && selectedType.value !== user.value.accountType)

function messageFrom(err: unknown): string {
  const fe = err as { data?: { data?: { message?: string } } }
  return fe.data?.data?.message ?? 'Something went wrong — try again'
}

async function run(action: () => Promise<unknown>, successNote: string) {
  busy.value = true
  errorMsg.value = ''
  notice.value = ''
  try {
    await action()
    await refresh()
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

const toggleActive = () => run(
  () => $fetch(`/api/admin/users/${route.params.id}`, {
    method: 'PATCH',
    body: { isActive: !user.value!.isActive },
  }),
  user.value!.isActive ? 'User deactivated' : 'User reactivated',
)

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

/** Representative permission toggles from the mockup, mapped to real keys. */
const PERMISSION_ROWS = [
  { label: 'Upload service logs', key: 'service_logs.upload.own' },
  { label: 'Review service logs', key: 'service_logs.review.all' },
  { label: 'View all vehicles', key: 'vehicles.read.all' },
  { label: 'Create invoices', key: 'invoices.create.all' },
  { label: 'Manage users', key: 'users.manage.all' },
] as const

const effectivePermissions = computed<Set<string>>(() => {
  // Display only — the server re-evaluates permissions on every request.
  const type = user.value?.accountType as keyof typeof ACCOUNT_TYPE_BUNDLES | undefined
  return new Set(type ? ACCOUNT_TYPE_BUNDLES[type] : [])
})

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
  }
  return map[a.action] ?? a.action
}
</script>

<template>
  <section class="page active">
    <div v-if="error" class="card" style="padding:32px; text-align:center; color:#64748b;">
      User not found. <NuxtLink to="/users">Back to users</NuxtLink>
    </div>

    <template v-else-if="user">
      <div class="pagehead">
        <div>
          <h2>
            {{ user.name }}
            <span :class="accountTypePill(user.accountType)" style="vertical-align:3px">{{ accountTypeLabel(user.accountType) }}</span>
          </h2>
          <p><NuxtLink to="/users">Users</NuxtLink> / {{ user.email }} · joined {{ joinedLabel(user.createdAt) }}</p>
        </div>
        <div class="actions">
          <template v-if="user.status === 'pending' && canManage">
            <button class="btn" :disabled="busy" @click="rejectUser">Reject</button>
            <button class="btn primary" :disabled="busy" @click="approve">Approve</button>
          </template>
          <template v-else>
            <button class="btn" disabled title="Available in a later phase">Reset password</button>
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
          </template>
        </div>
      </div>

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
            <div class="chead"><h3>Permissions</h3></div>
            <div class="cbody" style="padding-top:6px; padding-bottom:6px;">
              <div v-for="row in PERMISSION_ROWS" :key="row.key" class="tglrow">
                {{ row.label }}
                <span class="tgl">
                  <input type="checkbox" :checked="effectivePermissions.has(row.key)" disabled>
                  <span class="tr" />
                </span>
              </div>
              <p style="font-size:12px; color:#94a3b8; margin:8px 0;">
                From the {{ accountTypeLabel(user.accountType) }} bundle. Per-user overrides arrive with the control panel.
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
              <dt>Joined</dt>
              <dd>{{ new Date(user.createdAt).toLocaleDateString() }}</dd>
            </dl>
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
</style>

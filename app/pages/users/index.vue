<script setup lang="ts">
definePageMeta({ layout: 'staff' })

interface UserRow {
  id: string
  name: string
  email: string
  accountType: string
  status: string
  emailVerified: boolean
  createdAt: string
}

const { data, refresh } = await useFetch<{ items: UserRow[], total: number }>(
  '/api/admin/users',
  { query: { pageSize: 100 } },
)

const users = computed(() => data.value?.items ?? [])
const pending = computed(() => users.value.filter(u => u.status === 'pending' && u.emailVerified))

const fAccount = ref<'all' | 'internal' | 'portal'>('all')
const fStatus = ref<'all' | 'active' | 'inactive' | 'pending'>('all')
const fType = ref('all')
const fSort = ref<'name-asc' | 'name-desc' | 'role-asc' | 'created-desc'>('name-asc')

const filtersDirty = computed(() =>
  fAccount.value !== 'all' || fStatus.value !== 'all' || fType.value !== 'all' || fSort.value !== 'name-asc',
)

function clearFilters() {
  fAccount.value = 'all'
  fStatus.value = 'all'
  fType.value = 'all'
  fSort.value = 'name-asc'
}

const filtered = computed(() => {
  let list = [...users.value]

  if (fAccount.value === 'internal') list = list.filter(u => u.accountType !== 'customer')
  if (fAccount.value === 'portal') list = list.filter(u => u.accountType === 'customer')

  if (fStatus.value === 'active') list = list.filter(u => u.status === 'active')
  if (fStatus.value === 'inactive') list = list.filter(u => u.status === 'disabled' || u.status === 'rejected')
  if (fStatus.value === 'pending') list = list.filter(u => u.status === 'pending')

  if (fType.value !== 'all') list = list.filter(u => u.accountType === fType.value)

  list.sort((a, b) => {
    switch (fSort.value) {
      case 'name-desc': return b.name.localeCompare(a.name)
      case 'role-asc': return a.accountType.localeCompare(b.accountType) || a.name.localeCompare(b.name)
      case 'created-desc': return b.createdAt.localeCompare(a.createdAt)
      default: return a.name.localeCompare(b.name)
    }
  })
  return list
})

const internalCount = computed(() => users.value.filter(u => u.accountType !== 'customer').length)
const portalCount = computed(() => users.value.filter(u => u.accountType === 'customer').length)

const typeSummary = computed(() => {
  const counts = new Map<string, number>()
  for (const u of users.value) counts.set(u.accountType, (counts.get(u.accountType) ?? 0) + 1)
  return [...counts.entries()].map(([key, n]) => ({ key, n }))
})

const TYPE_PERMISSION_SUMMARY: Record<string, string> = {
  super_admin: 'Full system control, users, backups, templates',
  admin: 'Day-to-day admin — users, billing, no audit tampering',
  manager: 'Operational oversight — customers, vehicles, invoices',
  accountant: 'Invoices, payments, AI approval, service log review',
  mechanic: 'Upload service logs, view assigned vehicles',
  viewer: 'Read-only internal access',
  external_auditor: 'Restricted read-only for CPA/bookkeeper',
  customer: 'Portal — own invoices, vehicles, requests',
}

// Approve / reject actions (P1-05 APIs)
const busyId = ref('')
const approveType = reactive<Record<string, string>>({})

async function approve(u: UserRow) {
  busyId.value = u.id
  try {
    const accountType = approveType[u.id]
    await $fetch(`/api/admin/users/${u.id}/approve`, {
      method: 'POST',
      body: accountType && accountType !== u.accountType ? { accountType } : {},
    })
    await refresh()
  }
  finally {
    busyId.value = ''
  }
}

async function reject(u: UserRow) {
  const reason = window.prompt(`Reject ${u.name}'s request? Enter a reason:`)
  if (!reason) return
  busyId.value = u.id
  try {
    await $fetch(`/api/admin/users/${u.id}/reject`, { method: 'POST', body: { reason } })
    await refresh()
  }
  finally {
    busyId.value = ''
  }
}
</script>

<template>
  <section class="page active">
    <div class="pagehead">
      <div>
        <h2>Users</h2>
        <p>{{ users.length }} accounts · {{ internalCount }} internal staff · {{ portalCount }} customer portal logins</p>
      </div>
      <div class="actions">
        <button class="btn">Export</button>
        <button class="btn primary">+ Invite user</button>
      </div>
    </div>

    <!-- Pending signups needing approval (SPEC §5) -->
    <div v-if="pending.length" class="card" style="margin-bottom:16px;">
      <div class="chead">
        <h3>Pending approval</h3>
        <div class="right"><span class="pill warn">{{ pending.length }} waiting</span></div>
      </div>
      <div>
        <div v-for="u in pending" :key="u.id" class="userrow">
          <span class="av" :class="avColor(u.name)">{{ initials(u.name) }}</span>
          <div class="nm">
            <b>{{ u.name }}</b>
            <small>{{ u.email }} · requested {{ accountTypeLabel(u.accountType) }}</small>
          </div>
          <div class="end">
            <select v-model="approveType[u.id]" class="approve-type" :disabled="busyId === u.id" aria-label="Account type to assign">
              <option :value="undefined" disabled selected hidden>{{ accountTypeLabel(u.accountType) }}</option>
              <option value="mechanic">Mechanic</option>
              <option value="accountant">Accountant</option>
              <option value="viewer">Viewer</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
            <button class="btn sm primary" :disabled="busyId === u.id" @click="approve(u)">Approve</button>
            <button class="btn sm" :disabled="busyId === u.id" @click="reject(u)">Reject</button>
          </div>
        </div>
      </div>
    </div>

    <ListFilterBar
      :show-search="false"
      :filters-active="filtersDirty"
      :count-label="`${filtered.length} user${filtered.length === 1 ? '' : 's'}`"
      @clear-filters="clearFilters"
    >
      <template #filters>
        <label class="fld">
          Account type
          <select id="users-f-account" v-model="fAccount">
            <option value="all">All accounts</option>
            <option value="internal">Internal staff</option>
            <option value="portal">Customer portal</option>
          </select>
        </label>
        <label class="fld">
          Status
          <select id="users-f-status" v-model="fStatus">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending</option>
          </select>
        </label>
        <label class="fld">
          Role
          <select id="users-f-role" v-model="fType">
            <option value="all">All roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="accountant">Accountant</option>
            <option value="mechanic">Mechanic</option>
            <option value="viewer">Viewer</option>
            <option value="external_auditor">External Auditor</option>
            <option value="customer">Customer</option>
          </select>
        </label>
        <label class="fld">
          Sort by
          <select id="users-f-sort" v-model="fSort">
            <option value="name-asc">Name A → Z</option>
            <option value="name-desc">Name Z → A</option>
            <option value="role-asc">Role A → Z</option>
            <option value="created-desc">Newest first</option>
          </select>
        </label>
      </template>
    </ListFilterBar>

    <div class="card">
      <div v-if="filtered.length">
        <NuxtLink
          v-for="u in filtered"
          :key="u.id"
          :to="`/users/${u.id}`"
          class="userrow click rowlink"
        >
          <span class="av" :class="avColor(u.name)">{{ initials(u.name) }}</span>
          <div class="nm">
            <b>{{ u.name }}</b>
            <small>{{ u.email }} · {{ accountTypeLabel(u.accountType) }}</small>
          </div>
          <div class="end">
            <span :class="accountTypePill(u.accountType)">{{ accountTypeLabel(u.accountType) }}</span>
            <span :class="statusPill(u.status)">{{ statusLabel(u.status) }}</span>
          </div>
        </NuxtLink>
      </div>
      <div v-else class="empty" style="display:block;">
        No users match your search.
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="chead">
        <h3>Account types</h3>
        <div class="right">
          <NuxtLink to="/admin" class="btn sm">Manage in control panel →</NuxtLink>
        </div>
      </div>
      <div class="tscroll">
        <table class="tbl">
          <thead><tr><th>Type</th><th>Users</th><th>Key permissions</th></tr></thead>
          <tbody>
            <tr v-for="t in typeSummary" :key="t.key">
              <td><span :class="accountTypePill(t.key)">{{ accountTypeLabel(t.key) }}</span></td>
              <td>{{ t.n }}</td>
              <td>{{ TYPE_PERMISSION_SUMMARY[t.key] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.rowlink {
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}
.rowlink:hover {
  background: #fafbfe;
}
.approve-type {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 5px 8px;
  font: inherit;
  font-size: 12.5px;
  color: #475569;
  background: #fff;
}

/* Mobile: single-line rows — hide the secondary pill and the inline
   account-type select (assignment stays available on the detail page). */
@media (max-width: 720px) {
  .rowlink .end .pill:first-child {
    display: none;
  }
  .approve-type {
    display: none;
  }
}
</style>

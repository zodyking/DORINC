<script setup lang="ts">
// Platform-wide audit log (mockup: PAGE: SYSTEM LOGS). Append-only — no delete UI.
definePageMeta({ layout: 'staff' })

type AuditCategory = 'all' | 'settings' | 'users' | 'backups' | 'security'

interface AuditLogRow {
  id: string
  entityType: string
  entityId: string | null
  action: string
  actorUserId: string | null
  actorName: string | null
  actorEmail: string | null
  actorAccountType: string | null
  changedFields: unknown
  afterData: unknown
  beforeData: unknown
  riskLevel: string
  ipAddress: string | null
  requestId: string | null
  createdAt: string
}

interface UserOption {
  id: string
  name: string
  email: string
}

const auth = useAuthStore()
const canRead = computed(() => auth.can('audit.read.all'))

const q = ref('')
const category = ref<AuditCategory>('all')
const entityType = ref('')
const action = ref('')
const actorUserId = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const page = ref(1)
const PAGE_SIZE = 25

watch([q, category, entityType, action, actorUserId, dateFrom, dateTo], () => { page.value = 1 })

const query = computed(() => ({
  page: page.value,
  pageSize: PAGE_SIZE,
  q: q.value || undefined,
  category: category.value,
  entityType: entityType.value || undefined,
  action: action.value || undefined,
  actorUserId: actorUserId.value || undefined,
  dateFrom: dateFrom.value || undefined,
  dateTo: dateTo.value || undefined,
}))

const { data: facets } = await useFetch<{ entityTypes: string[], actions: string[] }>(
  '/api/audit-logs/facets',
  { immediate: canRead.value },
)

const { data: usersData } = await useFetch<{ items: UserOption[] }>(
  '/api/admin/users',
  { query: { pageSize: 100 }, immediate: canRead.value && auth.can('users.read.all') },
)

const { data } = await useFetch<{ items: AuditLogRow[], total: number }>(
  '/api/audit-logs',
  { query, immediate: canRead.value },
)

const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

const entityOptions = computed(() => facets.value?.entityTypes ?? [])
const actionOptions = computed(() => facets.value?.actions ?? [])
const userOptions = computed(() => usersData.value?.items ?? [])

const filtersDirty = computed(() =>
  category.value !== 'all'
  || !!entityType.value
  || !!action.value
  || !!actorUserId.value
  || !!dateFrom.value
  || !!dateTo.value,
)

function clearFilters() {
  category.value = 'all'
  entityType.value = ''
  action.value = ''
  actorUserId.value = ''
  dateFrom.value = ''
  dateTo.value = ''
}

const rangeLabel = computed(() => {
  if (!total.value) return 'No log entries'
  const from = (page.value - 1) * PAGE_SIZE + 1
  const to = Math.min(page.value * PAGE_SIZE, total.value)
  return `Showing ${from}—${to} of ${total.value.toLocaleString()}`
})

const subtitle = computed(() => {
  const n = total.value
  return `${n.toLocaleString()} event${n === 1 ? '' : 's'}`
})
</script>

<template>
  <section v-if="!canRead" class="page active">
    <div class="empty">You do not have permission to view system logs.</div>
  </section>

  <section v-else class="page active">
    <div class="pagehead">
      <div>
        <h2>System Logs</h2>
        <p>Platform-wide events — settings, security, imports, backups, and jobs</p>
      </div>
      <div class="actions">
        <button type="button" class="btn" disabled title="Coming soon">Export log</button>
      </div>
    </div>

    <div class="card">
      <div class="chead">
        <button
          v-for="chip in AUDIT_CATEGORY_CHIPS"
          :key="chip.key"
          type="button"
          class="chip"
          :class="{ on: category === chip.key }"
          @click="category = chip.key"
        >
          {{ chip.label }}
        </button>
      </div>

      <ListFilterBar
        v-model:search="q"
        search-placeholder="Search system events, users, actions…"
        search-aria-label="Search system logs"
        :filters-active="filtersDirty"
        filter-title="Filter logs"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <label class="fld">
            Entity
            <select v-model="entityType" aria-label="Filter by entity type">
              <option value="">All entities</option>
              <option v-for="et in entityOptions" :key="et" :value="et">{{ entityTypeLabel(et) }}</option>
            </select>
          </label>
          <label class="fld">
            Action
            <select v-model="action" aria-label="Filter by action">
              <option value="">All actions</option>
              <option v-for="a in actionOptions" :key="a" :value="a">{{ a }}</option>
            </select>
          </label>
          <label v-if="userOptions.length" class="fld">
            User
            <select v-model="actorUserId" aria-label="Filter by user">
              <option value="">All users</option>
              <option v-for="u in userOptions" :key="u.id" :value="u.id">{{ u.name }}</option>
            </select>
          </label>
          <label class="fld">
            From
            <input v-model="dateFrom" type="date" aria-label="Filter from date">
          </label>
          <label class="fld">
            To
            <input v-model="dateTo" type="date" aria-label="Filter to date">
          </label>
        </template>
      </ListFilterBar>

      <div class="tscroll">
        <table v-if="items.length" id="audit-rows" class="tbl audit-tbl">
          <thead>
            <tr>
              <th class="col-time">Time</th>
              <th class="col-user">User</th>
              <th class="col-action">Action</th>
              <th class="col-detail">Detail</th>
              <th class="col-ip">IP</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in items" :key="row.id">
              <td class="col-time mono when">{{ auditWhenDisplay(row.createdAt) }}</td>
              <td class="col-user">{{ auditActorDisplay(row.actorName, row.actorEmail) }}</td>
              <td class="col-action">
                <span :class="auditActionPill(row.action, row.riskLevel).cls">
                  {{ auditActionPill(row.action, row.riskLevel).label }}
                </span>
              </td>
              <td class="col-detail">{{ auditDetailDisplay(row) }}</td>
              <td class="col-ip mono">{{ auditIpDisplay(row.ipAddress) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else id="audit-rows-empty" class="empty">No system log entries match your search.</div>
      </div>

      <div class="cfoot">
        <span>{{ rangeLabel }}</span>
        <div v-if="pageCount > 1" class="pager">
          <button type="button" aria-label="Previous page" :disabled="page <= 1" @click="page--">‹</button>
          <button
            v-for="p in Math.min(pageCount, 7)"
            :key="p"
            type="button"
            :class="{ on: p === page }"
            @click="page = p"
          >
            {{ p }}
          </button>
          <button type="button" aria-label="Next page" :disabled="page >= pageCount" @click="page++">›</button>
        </div>
      </div>
    </div>

    <p class="append-note">{{ subtitle }}</p>
  </section>
</template>

<style scoped>
.chead {
  flex-wrap: wrap;
  gap: 8px;
}

.mono {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 12px;
}

.when {
  white-space: nowrap;
}

.append-note {
  margin: 12px 2px 0;
  font-size: 12px;
  color: #94a3b8;
}
</style>

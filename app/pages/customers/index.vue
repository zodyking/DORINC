<script setup lang="ts">
import { moneyDisplay } from '~/utils/invoices-ui'
import { avColor, initials } from '~/utils/users-ui'

definePageMeta({ layout: 'staff' })

const auth = useAuthStore()
const canImport = computed(() => auth.can('system.admin.all'))

interface CustomerRow {
  id: string
  displayName: string
  accountKind: 'fleet' | 'individual'
  email: string | null
  phone: string | null
  portalEnabled: boolean
  archivedAt: string | null
  createdAt: string
  primaryContact: { name: string, email: string | null, phone: string | null } | null
  contactCount: number
  vehicleCount: number
  invoiceCount: number
  openInvoiceCount: number
  openBalance: string
  lifetimeBilled: string
}

const q = ref('')
const fKind = ref<'all' | 'fleet' | 'individual'>('all')
const fPortal = ref<'all' | 'on' | 'off'>('all')
const fSort = ref<'name-asc' | 'name-desc' | 'newest'>('name-asc')
const showArchived = ref(false)

const query = computed(() => ({
  pageSize: 100,
  q: q.value || undefined,
  kind: fKind.value === 'all' ? undefined : fKind.value,
  portal: fPortal.value === 'all' ? undefined : fPortal.value,
  sort: fSort.value,
  includeArchived: showArchived.value || undefined,
}))

const { data } = await useFetch<{ items: CustomerRow[], total: number }>(
  '/api/customers',
  { query },
)

const items = computed(() => data.value?.items ?? [])
const fleetCount = computed(() => items.value.filter(c => c.accountKind === 'fleet').length)

const filtersDirty = computed(() =>
  fKind.value !== 'all' || fPortal.value !== 'all' || fSort.value !== 'name-asc' || showArchived.value || !!q.value,
)

function clearFilters() {
  q.value = ''
  fKind.value = 'all'
  fPortal.value = 'all'
  fSort.value = 'name-asc'
  showArchived.value = false
}

function subtitleFor(c: CustomerRow): string {
  if (c.primaryContact) {
    return [c.primaryContact.name, c.primaryContact.email ?? c.primaryContact.phone]
      .filter(Boolean).join(' · ')
  }
  const kind = c.accountKind === 'fleet' ? 'Fleet' : 'Individual'
  return [kind, c.email ?? c.phone].filter(Boolean).join(' · ')
}
</script>

<template>
  <section class="page active">
    <div class="pagehead">
      <div>
        <h2>Customers</h2>
        <p>{{ data?.total ?? 0 }} accounts · {{ fleetCount }} fleet · {{ items.length - fleetCount }} individual</p>
      </div>
      <div class="actions">
        <NuxtLink
          v-if="canImport"
          to="/admin?tab=import&table=customers"
          class="btn"
        >
          Import
        </NuxtLink>
        <NuxtLink to="/customers/new" class="btn primary">+ New Customer</NuxtLink>
      </div>
    </div>

    <div class="fsbar">
      <div class="fs-group" style="flex:1; min-width:180px;">
        <div class="search" style="width:100%; height:32px;">
          <span class="gl">⌕</span>
          <input
            v-model="q"
            type="search"
            placeholder="Search name, contact, bus #, VIN, plate…"
            aria-label="Search customers"
          >
        </div>
      </div>
      <div class="fs-group">
        <label for="cust-f-type">Account type</label>
        <select id="cust-f-type" v-model="fKind">
          <option value="all">All types</option>
          <option value="fleet">Fleet</option>
          <option value="individual">Individual</option>
        </select>
      </div>
      <div class="fs-group">
        <label for="cust-f-portal">Portal</label>
        <select id="cust-f-portal" v-model="fPortal">
          <option value="all">All statuses</option>
          <option value="on">Enabled</option>
          <option value="off">Disabled</option>
        </select>
      </div>
      <span class="fs-sep" aria-hidden="true" />
      <div class="fs-group">
        <label for="cust-f-sort">Sort by</label>
        <select id="cust-f-sort" v-model="fSort">
          <option value="name-asc">Name A → Z</option>
          <option value="name-desc">Name Z → A</option>
          <option value="newest">Newest first</option>
        </select>
      </div>
      <div class="fs-group">
        <label for="cust-f-archived">Archived</label>
        <select id="cust-f-archived" v-model="showArchived">
          <option :value="false">Hidden</option>
          <option :value="true">Shown</option>
        </select>
      </div>
      <div class="fs-meta">
        <span class="fs-count">{{ items.length }} customer{{ items.length === 1 ? '' : 's' }}</span>
        <button type="button" class="fs-clear" :disabled="!filtersDirty" @click="clearFilters">Clear filters</button>
      </div>
    </div>

    <div v-if="items.length" class="grid3">
      <NuxtLink
        v-for="c in items"
        :key="c.id"
        :to="`/customers/${c.id}`"
        class="ent entlink"
      >
        <div class="top">
          <span class="av" :class="avColor(c.displayName)">{{ initials(c.displayName) }}</span>
          <div class="nm">
            {{ c.displayName }}
            <small>{{ subtitleFor(c) }}</small>
          </div>
        </div>
        <div class="meta">
          <span>Vehicles <b>{{ c.vehicleCount }}</b></span>
          <span>Invoices <b>{{ c.invoiceCount }}</b></span>
          <span>Open <b>{{ moneyDisplay(c.openBalance) }}</b></span>
          <span v-if="c.archivedAt" class="pill gray">Archived</span>
          <span v-else-if="c.portalEnabled" class="pill ok">Portal on</span>
          <span v-else class="pill gray">Portal off</span>
        </div>
      </NuxtLink>
    </div>
    <div v-else class="empty" style="display:block;">
      No customers match your search.
    </div>
  </section>
</template>

<style scoped>
.entlink {
  text-decoration: none;
  color: inherit;
  display: block;
}

/* Mobile: entity cards stay compact — single-line name/subtitle */
@media (max-width: 720px) {
  .entlink .top .nm {
    min-width: 0;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .entlink .top .nm small {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>

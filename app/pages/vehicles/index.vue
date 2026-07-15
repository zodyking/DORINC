<script setup lang="ts">
// Staff vehicles list (mockup: PAGE: VEHICLES).
import { windowedPagerPages } from '~/utils/pager-ui'

definePageMeta({ layout: 'staff', permission: 'vehicles.read.all' })

interface VehicleRow {
  id: string
  customerId: string
  customerName: string
  unitType: string
  busNumber: string | null
  unitTag: string | null
  vin: string | null
  plate: string | null
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  odometer: string | null
  odometerUnit: string
  status: string
  archivedAt: string | null
  createdAt: string
}

const auth = useAuthStore()
const canCreate = computed(() => auth.can('vehicles.create.all'))
const canBulkDecode = computed(() =>
  auth.can('vehicles.decode_vin.all') && auth.can('vehicles.update.all'),
)

const q = ref('')
const fType = ref<'all' | 'truck' | 'bus' | 'equipment' | 'tractor' | 'other'>('all')
const fCustomer = ref('all')
const fSort = ref<'tag-asc' | 'tag-desc' | 'customer-asc' | 'odo-desc' | 'newest'>('tag-asc')
const showArchived = ref(false)
const page = ref(1)
const PAGE_SIZE = 25

const bulkDecodeBusy = ref(false)
const bulkDecodeMessage = ref('')
const bulkDecodeError = ref('')

watch([q, fType, fCustomer, fSort, showArchived], () => { page.value = 1 })

const query = computed(() => ({
  page: page.value,
  pageSize: PAGE_SIZE,
  q: q.value || undefined,
  unitType: fType.value === 'all' ? undefined : fType.value,
  customerId: fCustomer.value === 'all' ? undefined : fCustomer.value,
  sort: fSort.value,
  includeArchived: showArchived.value || undefined,
}))

const { data, refresh } = useClientFetch<{ items: VehicleRow[], total: number }>(
  '/api/vehicles',
  { query },
)

async function runBulkVinDecode() {
  if (bulkDecodeBusy.value) return
  if (!window.confirm(
    'Decode VIN for all vehicles missing year, make, or model and save the results? This may take a minute for large fleets.',
  )) return

  bulkDecodeBusy.value = true
  bulkDecodeMessage.value = ''
  bulkDecodeError.value = ''
  try {
    const res = await $fetch<{
      scanned: number
      updated: number
      skipped: number
      failed: number
    }>('/api/vehicles/decode-missing', {
      method: 'POST',
      body: { limit: 200 },
    })
    bulkDecodeMessage.value = res.scanned === 0
      ? 'No vehicles need VIN decode — all entries with a VIN already have year, make, and model.'
      : `Decoded ${res.scanned} vehicle${res.scanned === 1 ? '' : 's'}: ${res.updated} updated, ${res.skipped} skipped, ${res.failed} failed.`
    await refresh()
  }
  catch (err) {
    const data = (err as { data?: { message?: string } })?.data
    bulkDecodeError.value = data?.message ?? 'Bulk VIN decode failed'
  }
  finally {
    bulkDecodeBusy.value = false
  }
}

const { data: customersData } = useClientFetch<{ items: { id: string, displayName: string }[], total: number }>(
  '/api/customers',
  { query: { pageSize: 500, sort: 'name-asc' } },
)

const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const customerOptions = computed(() => customersData.value?.items ?? [])
const customerCount = computed(() => new Set(items.value.map(v => v.customerId)).size)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const pagerPages = computed(() => windowedPagerPages(page.value, pageCount.value))

const filtersDirty = computed(() =>
  fType.value !== 'all' || fCustomer.value !== 'all' || fSort.value !== 'tag-asc' || showArchived.value || !!q.value,
)

function clearFilters() {
  q.value = ''
  fType.value = 'all'
  fCustomer.value = 'all'
  fSort.value = 'tag-asc'
  showArchived.value = false
}

const rangeLabel = computed(() => {
  if (!total.value) return 'No vehicles'
  const from = (page.value - 1) * PAGE_SIZE + 1
  const to = Math.min(page.value * PAGE_SIZE, total.value)
  return `Showing ${from}—${to} of ${total.value}`
})
</script>

<template>
  <section class="page active">
    <StaffPageHead :subtitle="`${total} unit${total === 1 ? '' : 's'} across ${customerCount} customer${customerCount === 1 ? '' : 's'}`">
      <template #title>Vehicles</template>
      <template v-if="canBulkDecode || canCreate" #actions>
        <button
          v-if="canBulkDecode"
          type="button"
          class="btn"
          :disabled="bulkDecodeBusy"
          @click="runBulkVinDecode"
        >
          {{ bulkDecodeBusy ? 'Decoding VINs…' : 'Decode missing VINs' }}
        </button>
        <NuxtLink v-if="canCreate" to="/vehicles/new" class="btn primary" @click="armWizardSpeechFromCreateClick">+ Add Vehicle</NuxtLink>
      </template>
    </StaffPageHead>

    <p v-if="bulkDecodeMessage" class="help" style="color:#059669; margin:0 0 12px;">{{ bulkDecodeMessage }}</p>
    <p v-if="bulkDecodeError" class="help" style="color:#dc2626; margin:0 0 12px;">{{ bulkDecodeError }}</p>

    <ListFilterBar
      v-model:search="q"
      search-placeholder="Search tag, VIN, plate, make, customer…"
      search-aria-label="Search vehicles"
      :filters-active="filtersDirty"
      @clear-filters="clearFilters"
    >
      <template #filters>
        <label class="fld">
          Unit type
          <select id="veh-f-type" v-model="fType">
            <option value="all">All types</option>
            <option value="truck">Trucks</option>
            <option value="bus">Buses</option>
            <option value="equipment">Equipment</option>
            <option value="tractor">Ag / tractors</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label class="fld">
          Customer
          <select id="veh-f-customer" v-model="fCustomer">
            <option value="all">All customers</option>
            <option v-for="c in customerOptions" :key="c.id" :value="c.id">{{ c.displayName }}</option>
          </select>
        </label>
        <label class="fld">
          Sort by
          <select id="veh-f-sort" v-model="fSort">
            <option value="tag-asc">Tag A → Z</option>
            <option value="tag-desc">Tag Z → A</option>
            <option value="customer-asc">Customer A → Z</option>
            <option value="odo-desc">Odometer / hours high → low</option>
            <option value="newest">Newest first</option>
          </select>
        </label>
        <label class="fld">
          Archived
          <select id="veh-f-archived" v-model="showArchived">
            <option :value="false">Hidden</option>
            <option :value="true">Shown</option>
          </select>
        </label>
      </template>
    </ListFilterBar>

    <div class="card">
      <div class="tscroll">
        <table v-if="items.length" class="tbl veh-tbl">
          <thead>
            <tr>
              <th class="cell-tag">Tag / Unit</th>
              <th class="col-vin">VIN / Serial</th>
              <th class="cell-cust">Customer</th>
              <th class="col-odo">Odometer / Hours</th>
              <th class="col-added">Added</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="v in items"
              :key="v.id"
              class="click"
              @click="navigateTo(`/vehicles/${v.id}`)"
            >
              <td class="cell-tag">
                <span class="lead tag">{{ vehicleTag(v) }}<span v-if="v.archivedAt" class="pill gray" style="margin-left:8px; vertical-align:1px;">Archived</span></span>
                <span class="sub">{{ vehicleSub(v) }}</span>
              </td>
              <td class="mono col-vin" style="font-size:12px">{{ v.vin ?? '—' }}</td>
              <td class="cell-cust">{{ v.customerName }}</td>
              <td class="col-odo">{{ odoDisplay(v.odometer, v.odometerUnit) }}</td>
              <td class="col-added">{{ new Date(v.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty" style="display:block;">
          No vehicles match your search.
        </div>
      </div>

      <div class="cfoot">
        <span>{{ rangeLabel }}</span>
        <div v-if="pageCount > 1" class="pager">
          <button aria-label="Previous page" :disabled="page <= 1" @click="page--">‹</button>
          <button
            v-for="p in pagerPages"
            :key="p"
            :class="{ on: p === page }"
            @click="page = p"
          >
            {{ p }}
          </button>
          <button aria-label="Next page" :disabled="page >= pageCount" @click="page++">›</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// Service logs list + review queue (mockup: PAGE: SERVICE LOGS).
definePageMeta({ layout: 'staff' })

interface VehicleBits {
  unitType: string
  busNumber: string | null
  unitTag: string | null
  year: number | null
  make: string | null
  model: string | null
}

interface ServiceLogRow {
  id: string
  logNumber: number
  status: string
  workType: string
  customerName: string
  submitterName: string
  createdAt: string
  fileCount: number
  invoiceId: string | null
  vehicle: VehicleBits
}

const auth = useAuthStore()
const canUpload = computed(() => auth.can('service_logs.upload.own'))
const canReview = computed(() => auth.can('service_logs.review.all'))
const isMechanicScope = computed(() => !auth.can('service_logs.read.all') && auth.can('service_logs.read.own'))

const q = ref('')
const page = ref(1)
const PAGE_SIZE = 25

watch(q, () => { page.value = 1 })

const query = computed(() => ({
  page: page.value,
  pageSize: PAGE_SIZE,
  q: q.value || undefined,
  queue: canReview.value ? 'review' as const : undefined,
  sort: 'newest' as const,
}))

const { data } = await useFetch<{ items: ServiceLogRow[], total: number }>(
  '/api/service-logs',
  { query },
)

const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const pageTitle = computed(() => isMechanicScope.value ? 'My Service Logs' : 'Service Logs')
const queueTitle = computed(() => {
  if (isMechanicScope.value) return `My logs · ${total.value}`
  return `Review queue · ${total.value}`
})

function openLog(id: string) {
  navigateTo(`/service-logs/${id}`)
}
</script>

<template>
  <section class="page active">
    <div class="pagehead">
      <div>
        <h2>{{ pageTitle }}</h2>
        <p id="sl-page-sub">
          {{ isMechanicScope
            ? 'Your field uploads and their review status'
            : 'Field uploads land here for review before they become invoice lines' }}
        </p>
      </div>
      <div class="actions">
        <NuxtLink v-if="canUpload" to="/service-logs/new" class="btn primary">+ New service log</NuxtLink>
      </div>
    </div>

    <div class="card">
      <div class="chead">
        <h3>{{ queueTitle }}</h3>
        <div class="right">
          <div class="search" style="width:220px; height:32px;">
            <span class="gl">⌕</span>
            <input
              v-model="q"
              type="search"
              placeholder="Search service logs…"
              aria-label="Search service logs"
            >
          </div>
        </div>
      </div>

      <div v-if="items.length" id="log-queue">
        <div
          v-for="log in items"
          :key="log.id"
          class="qitem sl-row"
          style="cursor:pointer"
          @click="openLog(log.id)"
        >
          <div class="thumb">{{ log.fileCount ? '🖼' : '📄' }}</div>
          <div class="info">
            <b>{{ logTitle(log.logNumber, log.vehicle, log.workType) }}</b>
            <div class="sub">{{ logSubtitle(log.customerName, log.createdAt, log.submitterName, log.fileCount) }}</div>
            <div style="margin-top:6px;">
              <span :class="serviceLogStatusPill(log.status as ServiceLogStatus).cls">
                {{ serviceLogStatusPill(log.status as ServiceLogStatus).label }}
              </span>
            </div>
          </div>
          <div class="qa" @click.stop>
            <template v-if="canReview && log.status !== 'converted_to_invoice'">
              <button class="btn sm primary" type="button" @click="openLog(log.id)">Review &amp; invoice</button>
              <button class="btn sm" type="button" @click="openLog(log.id)">Open</button>
            </template>
            <template v-else-if="log.status === 'converted_to_invoice' && log.invoiceId">
              <NuxtLink :to="`/invoices/${log.invoiceId}`" class="btn sm" @click.stop>View invoice</NuxtLink>
            </template>
            <template v-else>
              <button class="btn sm" type="button" @click="openLog(log.id)">View log</button>
            </template>
          </div>
        </div>
      </div>
      <div v-else id="log-queue-empty" class="empty">No service logs match your search.</div>
    </div>
  </section>
</template>

<script setup lang="ts">
// Customer portal invoices list — filters, PDF download (mockup: Portal Invoices / P2-05).
import {
  invoiceDateDisplay,
  moneyDisplay,
  portalInvoiceFilterLabel,
  portalInvoiceListSublabel,
  portalInvoiceMatchesFilter,
  portalInvoicePdfUrl,
  portalInvoiceStatus,
  type PortalInvoiceFilter,
} from '~/utils/portal-invoices-ui'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

interface PortalInvoiceRow {
  id: string
  invoiceNumberFormatted: string
  status: string
  invoiceDate: string
  dueDate: string | null
  total: string
  balanceDue: string
  vehicleLabel: string
}

const filter = ref<PortalInvoiceFilter>('all')

const { data, error } = await useFetch<{ items: PortalInvoiceRow[] }>('/api/portal/invoices')

const items = computed(() => data.value?.items ?? [])

const filtered = computed(() =>
  items.value.filter(inv => portalInvoiceMatchesFilter(inv.status, inv.balanceDue, filter.value)),
)

const chips: PortalInvoiceFilter[] = ['all', 'open', 'paid']

function downloadPdf(event: Event, invoiceId: string) {
  event.stopPropagation()
  window.location.href = portalInvoicePdfUrl(invoiceId)
}
</script>

<template>
  <section class="page active">
    <div v-if="error" class="card" style="padding:24px;">
      <p>Unable to load invoices.</p>
    </div>

    <template v-else>
      <div class="pagehead">
        <div>
          <h2>Invoices</h2>
          <p>Your company's billing history</p>
        </div>
      </div>

      <div class="card">
        <div class="chead">
          <button
            v-for="chip in chips"
            :key="chip"
            type="button"
            class="chip"
            :class="{ on: filter === chip }"
            @click="filter = chip"
          >
            {{ portalInvoiceFilterLabel(chip) }}
          </button>
        </div>

        <div v-if="!filtered.length" class="empty" style="padding:24px;color:#64748b;font-size:13px;">
          No invoices match this filter.
        </div>

        <div v-else class="tscroll">
          <table class="tbl">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Vehicle</th>
                <th>Issued</th>
                <th>Status</th>
                <th class="num">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="inv in filtered"
                :key="inv.id"
                class="click"
                @click="navigateTo(`/portal/invoices/${inv.id}`)"
              >
                <td>
                  <span class="lead">{{ inv.invoiceNumberFormatted }}</span>
                  <span class="sub">{{ portalInvoiceListSublabel(inv.status, inv.dueDate, inv.invoiceDate) }}</span>
                </td>
                <td>{{ inv.vehicleLabel }}</td>
                <td>{{ invoiceDateDisplay(inv.invoiceDate) }}</td>
                <td>
                  <span :class="portalInvoiceStatus(inv.status, inv.dueDate, inv.balanceDue).cls">
                    {{ portalInvoiceStatus(inv.status, inv.dueDate, inv.balanceDue).label }}
                  </span>
                </td>
                <td class="num">{{ moneyDisplay(inv.total) }}</td>
                <td>
                  <button type="button" class="btn sm dl-pdf" @click="downloadPdf($event, inv.id)">
                    PDF
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>

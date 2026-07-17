<script setup lang="ts">
import { formatAuditChangeMessage } from '#shared/audit-messages'
import {
  invoiceDateDisplay,
  invoiceStatusPill,
  moneyDisplay,
  type InvoiceStatus,
} from '~/utils/invoices-ui'
import { avColor, initials } from '~/utils/users-ui'
import { formatPhoneDisplay, phoneDisplay } from '~/utils/phone-ui'
import { messageLinkFetchQuery } from '~/utils/message-link-access'

definePageMeta({ layout: 'staff' })

interface Address { line1?: string, line2?: string, city?: string, state?: string, zip?: string }

interface Customer {
  id: string
  displayName: string
  accountKind: 'fleet' | 'individual'
  email: string | null
  phone: string | null
  billingAddress: Address | null
  serviceAddress: Address | null
  taxExempt: boolean
  paymentTerms: string
  notes: string | null
  portalEnabled: boolean
  archivedAt: string | null
  createdAt: string
}

interface Contact {
  id: string
  name: string
  email: string | null
  phone: string | null
  title: string | null
  isPrimary: boolean
  isBilling: boolean
}

interface HistoryRow {
  id: string
  action: string
  actorName: string | null
  changedFields: string[] | null
  beforeData?: Record<string, unknown> | null
  afterData?: Record<string, unknown> | null
  createdAt: string
}

const route = useRoute()
const auth = useAuthStore()

interface BillingSummary {
  invoiceCount: number
  openInvoiceCount: number
  openBalance: string
  lifetimeBilled: string
}

interface RecentInvoiceRow {
  id: string
  invoiceNumberFormatted: string
  status: string
  invoiceDate: string
  dueDate: string | null
  total: string
  balanceDue: string
}

const customerId = computed(() => String(route.params.id || ''))
const customerFetchKey = computed(() => `customer-detail-${customerId.value}`)

const { data, refresh, error } = useClientFetch<{
  customer: Customer
  contacts: Contact[]
  history: HistoryRow[]
  billing: BillingSummary
  recentInvoices: RecentInvoiceRow[]
  taxExemptionDocument: {
    id: string
    originalFilename: string
    mimeType: string
    fileSizeBytes: number
    createdAt: string
  } | null
}>(() => `/api/customers/${customerId.value}`, { watch: [customerId], key: customerFetchKey, query: computed(() => messageLinkFetchQuery(route.query)) })

onMounted(() => {
  void refresh()
})

const customer = computed(() => data.value?.customer)
const contacts = computed(() => data.value?.contacts ?? [])
const history = computed(() => data.value?.history ?? [])
const billing = computed(() => data.value?.billing ?? {
  invoiceCount: 0,
  openInvoiceCount: 0,
  openBalance: '0',
  lifetimeBilled: '0',
})
const recentInvoices = computed(() => data.value?.recentInvoices ?? [])
const primary = computed(() => contacts.value.find(c => c.isPrimary) ?? contacts.value[0])
const canCreateInvoice = computed(() => auth.can('invoices.create.all'))
const canReadInvoices = computed(() => auth.can('invoices.read.all'))
const canUpdateCustomer = computed(() => auth.can('customers.update.all'))
const taxExemptionDocument = computed(() => data.value?.taxExemptionDocument ?? null)

// Fleet units for this customer (P1-10)
interface VehicleRow {
  id: string
  unitType: string
  busNumber: string | null
  unitTag: string | null
  vin: string | null
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  odometer: string | null
  odometerUnit: string
  status: string
  archivedAt: string | null
}

const { data: vehiclesData } = useClientFetch<{ items: VehicleRow[], total: number }>(
  '/api/vehicles',
  {
    query: computed(() => ({ customerId: customerId.value, pageSize: 100, sort: 'tag-asc' })),
    watch: [customerId],
  },
)
const vehicles = computed(() => vehiclesData.value?.items ?? [])

const canUpdate = computed(() => auth.can('customers.update.all'))
const canArchive = computed(() => auth.can('customers.archive.all'))
const canPortalAccess = computed(() => auth.can('customers.portal_access.all'))
const canSendCredentials = computed(() => auth.can('customers.send_credentials.all'))

interface PortalAccessSummary {
  portalEnabled: boolean
  userCount: number
  users: Array<{
    id: string
    name: string
    email: string
    username: string | null
    lastLoginAt: string | null
    mustChangePassword: boolean
    tempPasswordExpiresAt: string | null
  }>
  lastCredentialEmail: { at: string, status: string } | null
}

interface CredentialEmailRow {
  id: string
  recipientEmail: string
  sendType: string
  status: string
  sentAt: string | null
  createdAt: string
  sentByName: string
}

const { data: portalData, refresh: refreshPortal } = useClientFetch<PortalAccessSummary>(
  () => `/api/customers/${customerId.value}/portal-access`,
  { watch: [customerId] },
)
const { data: credentialHistory, refresh: refreshCredentialHistory } = useClientFetch<{ items: CredentialEmailRow[] }>(
  () => `/api/customers/${customerId.value}/credential-email-history`,
  { watch: [customerId] },
)

const portal = computed(() => portalData.value)
const credentialEmails = computed(() => credentialHistory.value?.items ?? [])
const lastPortalLogin = computed(() => {
  const dates = portal.value?.users.map(u => u.lastLoginAt).filter(Boolean) as string[]
  if (!dates.length) return null
  return dates.sort().reverse()[0]!
})

const busy = ref(false)
const flash = ref('')
const flashKind = ref<'ok' | 'err'>('ok')

function messageFrom(err: unknown): string {
  const fe = err as { data?: { data?: { message?: string } } }
  return fe.data?.data?.message ?? 'Something went wrong — try again'
}

async function run(action: () => Promise<unknown>, note: string) {
  busy.value = true
  flash.value = ''
  try {
    await action()
    await refresh()
    await refreshPortal()
    await refreshCredentialHistory()
    flash.value = note
    flashKind.value = 'ok'
  }
  catch (err) {
    flash.value = messageFrom(err)
    flashKind.value = 'err'
  }
  finally {
    busy.value = false
  }
}

const toggleArchive = () => run(
  () => $fetch(`/api/customers/${route.params.id}/${customer.value!.archivedAt ? 'restore' : 'archive'}`, { method: 'POST' }),
  customer.value!.archivedAt ? 'Customer restored' : 'Customer archived',
)

const togglePortal = () => run(
  () => $fetch(`/api/customers/${route.params.id}/portal-access`, {
    method: 'POST',
    body: { enabled: !portal.value?.portalEnabled },
  }),
  portal.value?.portalEnabled ? 'Portal access disabled' : 'Portal access enabled',
)

const sendCredentials = () => run(
  () => $fetch(`/api/customers/${route.params.id}/send-credentials`, { method: 'POST', body: {} }),
  'Credential email queued',
)

// ---- Contacts management (P1-09) ----
const contactFormOpen = ref(false)
const editingContactId = ref('')
const contactForm = reactive({ name: '', email: '', phone: '', title: '', isPrimary: false, isBilling: false })

function openAddContact() {
  editingContactId.value = ''
  Object.assign(contactForm, { name: '', email: '', phone: '', title: '', isPrimary: !contacts.value.length, isBilling: false })
  contactFormOpen.value = true
}

function openEditContact(c: Contact) {
  editingContactId.value = c.id
  Object.assign(contactForm, {
    name: c.name,
    email: c.email ?? '',
    phone: c.phone ?? '',
    title: c.title ?? '',
    isPrimary: c.isPrimary,
    isBilling: c.isBilling,
  })
  contactFormOpen.value = true
}

const saveContact = () => run(async () => {
  const body = {
    name: contactForm.name,
    email: contactForm.email || null,
    phone: contactForm.phone || null,
    title: contactForm.title || null,
    isPrimary: contactForm.isPrimary,
    isBilling: contactForm.isBilling,
  }
  if (editingContactId.value) {
    await $fetch(`/api/customers/${route.params.id}/contacts/${editingContactId.value}`, { method: 'PATCH', body })
  }
  else {
    await $fetch(`/api/customers/${route.params.id}/contacts`, { method: 'POST', body })
  }
  contactFormOpen.value = false
}, editingContactId.value ? 'Contact updated' : 'Contact added')

const removeContact = (c: Contact) => run(
  () => $fetch(`/api/customers/${route.params.id}/contacts/${c.id}/archive`, { method: 'POST' }),
  'Contact archived',
)

// ---- Display helpers ----
const TERMS_LABELS: Record<string, string> = {
  due_on_receipt: 'Due on receipt',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_45: 'Net 45',
  net_60: 'Net 60',
}

function addressLine(a: Address | null): string {
  if (!a) return '—'
  return [a.line1, a.city, a.state, a.zip].filter(Boolean).join(', ') || '—'
}

function histWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function histChange(h: HistoryRow): string {
  return formatAuditChangeMessage({
    action: h.action,
    changedFields: h.changedFields,
    beforeData: h.beforeData,
    afterData: h.afterData,
  })
}

function credWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function sinceYear(iso: string | undefined): string {
  return iso ? new Date(iso).getFullYear().toString() : ''
}

const SEND_LABELS: Record<string, string> = { initial: 'Initial send', resend: 'Resend' }
const CRED_STATUS_LABELS: Record<string, string> = { queued: 'Queued', sent: 'Sent', failed: 'Failed' }
</script>

<template>
  <section class="page active">
    <div v-if="error" class="card" style="padding:32px; text-align:center; color:#64748b;">
      Customer not found. <NuxtLink to="/customers">Back to customers</NuxtLink>
    </div>

    <template v-else-if="customer">
      <StaffPageHead>
        <template #title>
          {{ customer.displayName }}
          <span v-if="customer.archivedAt" class="pill gray" style="vertical-align:3px">Archived</span>
          <span v-else-if="customer.portalEnabled" class="pill ok" style="vertical-align:3px">Portal enabled</span>
        </template>
        <template #subtitle>
          <NuxtLink to="/customers">Customers</NuxtLink> /
          {{ customer.displayName }} ·
          {{ customer.accountKind === 'fleet' ? 'Fleet' : 'Individual' }} account since {{ sinceYear(customer.createdAt) }}
        </template>
        <template #actions>
          <NuxtLink v-if="canUpdate" :to="`/customers/${customer.id}/edit`" class="btn">Edit account</NuxtLink>
          <button
            v-if="canPortalAccess"
            class="btn"
            :disabled="busy || !!customer.archivedAt"
            @click="togglePortal"
          >
            {{ portal?.portalEnabled ? 'Disable portal' : 'Enable portal' }}
          </button>
          <button
            v-if="canSendCredentials"
            class="btn"
            :disabled="busy || !portal?.portalEnabled || !!customer.archivedAt"
            @click="sendCredentials"
          >
            {{ credentialEmails.length ? 'Resend portal invite' : 'Send portal invite' }}
          </button>
          <button
            v-if="customer.archivedAt && canArchive"
            class="btn"
            :disabled="busy"
            @click="toggleArchive"
          >
            Restore
          </button>
          <NuxtLink
            v-if="canCreateInvoice"
            :to="`/invoices/new?customerId=${customer.id}`"
            class="btn primary"
            @click="armWizardSpeechFromCreateClick"
          >
            + New Invoice
          </NuxtLink>
        </template>
      </StaffPageHead>

      <p v-if="flash" class="flash" :class="flashKind">{{ flash }}</p>

      <div class="kpis">
        <div class="kpi">
          <div class="t">Open balance</div>
          <div class="v">{{ moneyDisplay(billing.openBalance) }}</div>
          <div class="d flat">
            {{ billing.openInvoiceCount
              ? `${billing.openInvoiceCount} open invoice${billing.openInvoiceCount === 1 ? '' : 's'}`
              : 'No open invoices' }}
          </div>
        </div>
        <div class="kpi">
          <div class="t">Lifetime billed</div>
          <div class="v">{{ moneyDisplay(billing.lifetimeBilled) }}</div>
          <div class="d flat">{{ billing.invoiceCount }} invoice{{ billing.invoiceCount === 1 ? '' : 's' }}</div>
        </div>
        <div class="kpi"><div class="t">Contacts</div><div class="v">{{ contacts.length }}</div><div class="d flat">{{ primary ? primary.name : 'None yet' }}</div></div>
        <div class="kpi"><div class="t">Vehicles</div><div class="v">{{ vehicles.length }}</div><div class="d flat">{{ vehicles.length ? `${vehicles.filter(v => v.status === 'active').length} active` : 'No units yet' }}</div></div>
      </div>

      <div class="cols">
        <div class="stack">
          <div class="card">
            <div class="chead">
              <h3>Invoices · {{ billing.invoiceCount }}</h3>
              <div class="right">
                <NuxtLink
                  v-if="canReadInvoices"
                  :to="`/invoices?q=${encodeURIComponent(customer.displayName)}`"
                  class="btn sm"
                >
                  View all
                </NuxtLink>
              </div>
            </div>
            <div v-if="recentInvoices.length" class="tscroll">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Issued</th>
                    <th>Status</th>
                    <th class="num">Amount</th>
                    <th class="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="inv in recentInvoices"
                    :key="inv.id"
                    :class="{ click: canReadInvoices }"
                    @click="canReadInvoices ? navigateTo(`/invoices/${inv.id}`) : undefined"
                  >
                    <td><span class="lead">{{ inv.invoiceNumberFormatted }}</span></td>
                    <td>{{ invoiceDateDisplay(inv.invoiceDate) }}</td>
                    <td>
                      <span :class="invoiceStatusPill(inv.status as InvoiceStatus, inv.dueDate, inv.balanceDue).cls">
                        {{ invoiceStatusPill(inv.status as InvoiceStatus, inv.dueDate, inv.balanceDue).label }}
                      </span>
                    </td>
                    <td class="num">{{ moneyDisplay(inv.total) }}</td>
                    <td class="num">{{ moneyDisplay(inv.balanceDue) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty" style="display:block;">No invoices yet.</div>
          </div>

          <div class="card">
            <div class="chead">
              <h3>Contacts · {{ contacts.length }}</h3>
              <div class="right">
                <button v-if="canUpdate" class="btn sm" :disabled="busy" @click="openAddContact">+ Add contact</button>
              </div>
            </div>
            <div v-if="contacts.length">
              <div v-for="c in contacts" :key="c.id" class="userrow">
                <span class="av" :class="avColor(c.name)">{{ initials(c.name) }}</span>
                <div class="nm">
                  <b>{{ c.name }}</b>
                  <small>{{ [c.title, c.email, formatPhoneDisplay(c.phone)].filter(Boolean).join(' · ') || 'No contact info' }}</small>
                </div>
                <div class="end">
                  <span v-if="c.isPrimary" class="pill indigo">Primary</span>
                  <span v-if="c.isBilling" class="pill warn">Billing</span>
                  <button v-if="canUpdate" class="btn sm" :disabled="busy" @click="openEditContact(c)">Edit</button>
                  <button v-if="canUpdate" class="btn sm" :disabled="busy" @click="removeContact(c)">Archive</button>
                </div>
              </div>
            </div>
            <div v-else class="empty" style="display:block;">No contacts yet.</div>

            <div v-if="contactFormOpen" class="cbody" style="border-top:1px solid #f1f5f9;">
              <form @submit.prevent="saveContact">
                <label class="fld">Name <input v-model="contactForm.name" type="text" required></label>
                <label class="fld">Title <input v-model="contactForm.title" type="text" placeholder="e.g. Fleet manager"></label>
                <label class="fld">Email <input v-model="contactForm.email" type="email"></label>
                <label class="fld">Phone <input v-model="contactForm.phone" type="tel" @blur="contactForm.phone = formatPhoneDisplay(contactForm.phone)"></label>
                <div class="tglrow">Primary contact <span class="tgl"><input v-model="contactForm.isPrimary" type="checkbox"><span class="tr" /></span></div>
                <div class="tglrow">Billing contact <span class="tgl"><input v-model="contactForm.isBilling" type="checkbox"><span class="tr" /></span></div>
                <div style="display:flex; gap:10px; margin-top:10px;">
                  <button type="submit" class="btn primary sm" :disabled="busy">{{ editingContactId ? 'Save contact' : 'Add contact' }}</button>
                  <button type="button" class="btn sm" :disabled="busy" @click="contactFormOpen = false">Cancel</button>
                </div>
              </form>
            </div>
          </div>

          <div class="card">
            <div class="chead">
              <h3>Vehicles · {{ vehicles.length }}</h3>
              <div class="right">
                <NuxtLink v-if="canUpdate" :to="`/vehicles/new?customerId=${customer.id}`" class="btn sm" @click="armWizardSpeechFromCreateClick">+ Add vehicle</NuxtLink>
              </div>
            </div>
            <div v-if="vehicles.length" class="tscroll">
              <table class="tbl">
                <thead><tr><th>Tag / Unit</th><th>VIN</th><th class="num">Odometer</th></tr></thead>
                <tbody>
                  <tr v-for="v in vehicles" :key="v.id" class="click" @click="navigateTo(`/vehicles/${v.id}`)">
                    <td>
                      <span class="lead tag">{{ vehicleTag(v) }}</span>
                      <span class="sub">{{ vehicleSub(v) }}</span>
                    </td>
                    <td class="mono" style="font-size:12px">{{ v.vin ?? '—' }}</td>
                    <td class="num">{{ odoDisplay(v.odometer, v.odometerUnit) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty" style="display:block;">No vehicles yet.</div>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="chead"><h3>Account</h3></div>
            <dl class="kv">
              <dt>Primary contact</dt><dd>{{ customer.accountKind === 'individual' ? customer.displayName : (primary?.name ?? customer.displayName ?? '—') }}</dd>
              <dt>Email</dt><dd>{{ customer.accountKind === 'individual' ? (customer.email ?? primary?.email ?? '—') : (primary?.email ?? customer.email ?? '—') }}</dd>
              <dt>Phone</dt><dd>{{ phoneDisplay(customer.accountKind === 'individual' ? (customer.phone ?? primary?.phone) : (primary?.phone ?? customer.phone)) }}</dd>
              <dt>Terms</dt><dd>{{ TERMS_LABELS[customer.paymentTerms] ?? customer.paymentTerms }}{{ customer.taxExempt ? ' · Tax exempt' : '' }}</dd>
              <dt>Billing address</dt><dd>{{ addressLine(customer.billingAddress) }}</dd>
              <dt>Service address</dt><dd>{{ addressLine(customer.serviceAddress) }}</dd>
            </dl>
          </div>
          <div class="card">
            <div class="chead"><h3>Portal access</h3></div>
            <dl class="kv">
              <dt>Status</dt>
              <dd><span :class="portal?.portalEnabled ? 'pill ok' : 'pill gray'">{{ portal?.portalEnabled ? 'Active' : 'Not enabled' }}</span></dd>
              <dt>Users</dt><dd>{{ portal?.userCount ?? 0 }} {{ portal?.userCount === 1 ? 'login' : 'logins' }}</dd>
              <dt>Username</dt>
              <dd class="mono">{{ portal?.users[0]?.username ?? '—' }}</dd>
              <dt>Last login</dt><dd>{{ lastPortalLogin ? credWhen(lastPortalLogin) : '—' }}</dd>
              <dt>Last credential email</dt>
              <dd>
                <template v-if="portal?.lastCredentialEmail">
                  {{ credWhen(portal.lastCredentialEmail.at) }}
                  · {{ CRED_STATUS_LABELS[portal.lastCredentialEmail.status] ?? portal.lastCredentialEmail.status }}
                </template>
                <template v-else>—</template>
              </dd>
            </dl>
            <div v-if="credentialEmails.length" class="cbody" style="border-top:1px solid #f1f5f9; padding-top:12px;">
              <div style="font-size:12px; color:#64748b; margin-bottom:8px;">Credential email log</div>
              <div class="tscroll">
                <table class="tbl hist-log">
                  <thead><tr><th>When</th><th>To</th><th>Type</th><th>Status</th></tr></thead>
                  <tbody>
                    <tr v-for="row in credentialEmails" :key="row.id">
                      <td class="when">{{ credWhen(row.sentAt ?? row.createdAt) }}</td>
                      <td>{{ row.recipientEmail }}</td>
                      <td>{{ SEND_LABELS[row.sendType] ?? row.sendType }}</td>
                      <td><span class="pill" :class="row.status === 'sent' ? 'ok' : row.status === 'failed' ? 'bad' : 'gray'">{{ CRED_STATUS_LABELS[row.status] ?? row.status }}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <DocumentsEntityDocumentViewer
            category="tax_exemption_form"
            :document="taxExemptionDocument"
          />
          <div class="card">
            <div class="chead"><h3>Notes</h3></div>
            <div class="cbody" style="font-size:13px; color:#475569; line-height:1.6;">
              {{ customer.notes || 'No notes yet.' }}
            </div>
          </div>
          <div class="card">
            <div class="chead"><h3>Change history</h3></div>
            <div v-if="history.length" class="tscroll">
              <table class="tbl hist-log">
                <thead><tr><th>When</th><th>User</th><th>Change</th></tr></thead>
                <tbody>
                  <tr v-for="h in history" :key="h.id">
                    <td class="when">{{ histWhen(h.createdAt) }}</td>
                    <td class="who">{{ h.actorName ?? 'System' }}</td>
                    <td class="chg">{{ histChange(h) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty" style="display:block;">No changes recorded yet.</div>
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

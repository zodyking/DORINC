<script setup lang="ts">
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
  createdAt: string
}

const route = useRoute()
const auth = useAuthStore()

const { data, refresh, error } = await useFetch<{
  customer: Customer
  contacts: Contact[]
  history: HistoryRow[]
}>(`/api/customers/${route.params.id}`)

const customer = computed(() => data.value?.customer)
const contacts = computed(() => data.value?.contacts ?? [])
const history = computed(() => data.value?.history ?? [])
const primary = computed(() => contacts.value.find(c => c.isPrimary) ?? contacts.value[0])

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

const { data: vehiclesData } = await useFetch<{ items: VehicleRow[], total: number }>(
  '/api/vehicles',
  { query: { customerId: route.params.id as string, pageSize: 100, sort: 'tag-asc' } },
)
const vehicles = computed(() => vehiclesData.value?.items ?? [])

const canUpdate = computed(() => auth.can('customers.update.all'))
const canArchive = computed(() => auth.can('customers.archive.all'))

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

const HIST_LABELS: Record<string, string> = {
  'customers.create': 'Account created',
  'customers.update': 'Account updated',
  'customers.archive': 'Account archived',
  'customers.restore': 'Account restored',
  'customers.contact_add': 'Contact added',
  'customers.contact_update': 'Contact updated',
  'customers.contact_archive': 'Contact archived',
}

function histChange(h: HistoryRow): string {
  const label = HIST_LABELS[h.action] ?? h.action
  const fields = h.changedFields?.length ? ` · ${h.changedFields.join(', ')}` : ''
  return label + fields
}

function sinceYear(iso: string | undefined): string {
  return iso ? new Date(iso).getFullYear().toString() : ''
}
</script>

<template>
  <section class="page active">
    <div v-if="error" class="card" style="padding:32px; text-align:center; color:#64748b;">
      Customer not found. <NuxtLink to="/customers">Back to customers</NuxtLink>
    </div>

    <template v-else-if="customer">
      <div class="pagehead">
        <div>
          <h2>
            {{ customer.displayName }}
            <span v-if="customer.archivedAt" class="pill gray" style="vertical-align:3px">Archived</span>
            <span v-else-if="customer.portalEnabled" class="pill ok" style="vertical-align:3px">Portal enabled</span>
          </h2>
          <p>
            <NuxtLink to="/customers">Customers</NuxtLink> /
            {{ customer.displayName }} ·
            {{ customer.accountKind === 'fleet' ? 'Fleet' : 'Individual' }} account since {{ sinceYear(customer.createdAt) }}
          </p>
        </div>
        <div class="actions">
          <NuxtLink v-if="canUpdate" :to="`/customers/${customer.id}/edit`" class="btn">Edit account</NuxtLink>
          <button class="btn" disabled title="Portal access lands in Phase 2">Resend portal invite</button>
          <button
            v-if="canArchive"
            class="btn"
            :disabled="busy"
            @click="toggleArchive"
          >
            {{ customer.archivedAt ? 'Restore' : 'Archive' }}
          </button>
          <button class="btn primary" disabled title="Invoices land later in Phase 1">+ New Invoice</button>
        </div>
      </div>

      <p v-if="flash" class="flash" :class="flashKind">{{ flash }}</p>

      <div class="kpis">
        <div class="kpi"><div class="t">Open balance</div><div class="v">$0.00</div><div class="d flat">No open invoices</div></div>
        <div class="kpi"><div class="t">Lifetime billed</div><div class="v">$0.00</div><div class="d flat">0 invoices</div></div>
        <div class="kpi"><div class="t">Contacts</div><div class="v">{{ contacts.length }}</div><div class="d flat">{{ primary ? primary.name : 'None yet' }}</div></div>
        <div class="kpi"><div class="t">Vehicles</div><div class="v">{{ vehicles.length }}</div><div class="d flat">{{ vehicles.length ? `${vehicles.filter(v => v.status === 'active').length} active` : 'No units yet' }}</div></div>
      </div>

      <div class="cols">
        <div class="stack">
          <div class="card">
            <div class="chead"><h3>Invoices</h3></div>
            <div class="empty" style="display:block;">No invoices yet — invoicing lands later in Phase 1.</div>
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
                  <small>{{ [c.title, c.email, c.phone].filter(Boolean).join(' · ') || 'No contact info' }}</small>
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
                <label class="fld">Phone <input v-model="contactForm.phone" type="tel"></label>
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
                <NuxtLink v-if="canUpdate" :to="`/vehicles/new?customerId=${customer.id}`" class="btn sm">+ Add vehicle</NuxtLink>
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
              <dt>Primary contact</dt><dd>{{ primary?.name ?? '—' }}</dd>
              <dt>Email</dt><dd>{{ primary?.email ?? customer.email ?? '—' }}</dd>
              <dt>Phone</dt><dd>{{ primary?.phone ?? customer.phone ?? '—' }}</dd>
              <dt>Terms</dt><dd>{{ TERMS_LABELS[customer.paymentTerms] ?? customer.paymentTerms }}{{ customer.taxExempt ? ' · Tax exempt' : '' }}</dd>
              <dt>Billing address</dt><dd>{{ addressLine(customer.billingAddress) }}</dd>
              <dt>Service address</dt><dd>{{ addressLine(customer.serviceAddress) }}</dd>
            </dl>
          </div>
          <div class="card">
            <div class="chead"><h3>Portal access</h3></div>
            <dl class="kv">
              <dt>Status</dt>
              <dd><span :class="customer.portalEnabled ? 'pill ok' : 'pill gray'">{{ customer.portalEnabled ? 'Active' : 'Not enabled' }}</span></dd>
              <dt>Users</dt><dd>0 logins</dd>
              <dt>Pending requests</dt><dd>None</dd>
            </dl>
          </div>
          <div class="card">
            <div class="chead"><h3>Notes</h3></div>
            <div class="cbody" style="font-size:13px; color:#475569; line-height:1.6;">
              {{ customer.notes || 'No notes yet.' }}
            </div>
          </div>
          <div class="card">
            <div class="chead"><h3>Change history</h3><span style="font-size:12px;color:#94a3b8;">Append-only</span></div>
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

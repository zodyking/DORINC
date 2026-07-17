<script setup lang="ts">
import type { CustomerFormValue } from '~/components/customers/CustomerForm.vue'
import { formatPhoneDisplay } from '~/utils/phone-ui'

definePageMeta({ layout: 'staff' })

interface Address { line1?: string, city?: string, state?: string, zip?: string }
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
  archivedAt: string | null
}

const route = useRoute()
const auth = useAuthStore()
const customerId = computed(() => String(route.params.id || ''))
const customerFetchKey = computed(() => `customer-detail-${customerId.value}`)

const { data, error, refresh } = useClientFetch<{ customer: Customer, taxExemptionDocument: {
  id: string
  originalFilename: string
  mimeType: string
  fileSizeBytes: number
  createdAt: string
} | null }>(
  () => `/api/customers/${customerId.value}`,
  { watch: [customerId], key: customerFetchKey },
)

const customer = computed(() => data.value?.customer)
const taxExemptionDocument = computed(() => data.value?.taxExemptionDocument ?? null)
const canUpdateCustomer = computed(() => auth.can('customers.update.all'))
const canArchive = computed(() => auth.can('customers.archive.all'))

const form = reactive<CustomerFormValue>({
  displayName: '',
  accountKind: 'individual',
  email: '',
  phone: '',
  billingAddress: { line1: '', city: '', state: '', zip: '' },
  serviceAddress: { line1: '', city: '', state: '', zip: '' },
  taxExempt: false,
  paymentTerms: 'due_on_receipt',
  notes: '',
})

watchEffect(() => {
  const c = data.value?.customer
  if (!c) return
  form.displayName = c.displayName
  form.accountKind = c.accountKind
  form.email = c.email ?? ''
  form.phone = formatPhoneDisplay(c.phone ?? '')
  form.billingAddress = { line1: '', city: '', state: '', zip: '', ...c.billingAddress }
  form.serviceAddress = { line1: '', city: '', state: '', zip: '', ...c.serviceAddress }
  form.taxExempt = c.taxExempt
  form.paymentTerms = c.paymentTerms
  form.notes = c.notes ?? ''
})

const busy = ref(false)
const errorMsg = ref('')
const flash = ref('')

function cleanAddress(a: { line1: string, city: string, state: string, zip: string }) {
  return (a.line1 || a.city || a.state || a.zip) ? a : null
}

async function submit() {
  busy.value = true
  errorMsg.value = ''
  try {
    await $fetch(`/api/customers/${route.params.id}`, {
      method: 'PATCH',
      body: {
        displayName: form.displayName,
        accountKind: form.accountKind,
        email: form.email || null,
        phone: form.phone || null,
        billingAddress: cleanAddress(form.billingAddress),
        serviceAddress: cleanAddress(form.serviceAddress),
        taxExempt: form.taxExempt,
        paymentTerms: form.paymentTerms,
        notes: form.notes || null,
      },
    })
    await clearNuxtData(customerFetchKey.value)
    await navigateTo(`/customers/${route.params.id}`)
  }
  catch (err) {
    const fe = err as { data?: { data?: { message?: string } } }
    errorMsg.value = fe.data?.data?.message ?? 'Could not save changes — check the fields'
  }
  finally {
    busy.value = false
  }
}

async function restore() {
  busy.value = true
  errorMsg.value = ''
  try {
    await $fetch(`/api/customers/${route.params.id}/restore`, { method: 'POST' })
    flash.value = 'Customer restored'
    await refresh()
  }
  catch (err) {
    const fe = err as { data?: { data?: { message?: string } } }
    errorMsg.value = fe.data?.data?.message ?? 'Could not restore customer'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="page active">
    <div v-if="error" class="card" style="padding:32px; text-align:center; color:#64748b;">
      Customer not found. <NuxtLink to="/customers">Back to customers</NuxtLink>
    </div>
    <template v-else>
      <StaffPageHead>
        <template #title>
          Edit account
          <span v-if="customer?.archivedAt" class="pill gray" style="vertical-align:3px">Archived</span>
        </template>
        <template #subtitle>
          <NuxtLink to="/customers">Customers</NuxtLink> /
          <NuxtLink :to="`/customers/${route.params.id}`">{{ customer?.displayName }}</NuxtLink> / Edit
        </template>
        <template #actions>
          <button
            v-if="customer?.archivedAt && canArchive"
            type="button"
            class="btn"
            :disabled="busy"
            @click="restore"
          >
            Restore
          </button>
          <DeleteEntityButton
            v-if="customer && !customer.archivedAt"
            entity-type="customer"
            :entity-id="customer.id"
            :entity-label="customer.displayName"
            :disabled="busy"
            @submitted="flash = 'Deletion request submitted for admin review'"
          />
        </template>
      </StaffPageHead>
      <p v-if="flash" class="flash ok" style="margin:-8px 0 16px;">{{ flash }}</p>
      <CustomersCustomerForm
        v-model="form"
        :busy="busy"
        :error="errorMsg"
        submit-label="Save changes"
        @submit="submit"
        @cancel="navigateTo(`/customers/${route.params.id}`)"
      />
      <DocumentsEntityDocumentUploadPanel
        v-if="canUpdateCustomer"
        category="tax_exemption_form"
        :document="taxExemptionDocument"
        :upload-url="`/api/customers/${customerId}/documents/tax-exemption`"
        :remove-url="`/api/customers/${customerId}/documents/tax-exemption`"
        :can-manage="canUpdateCustomer"
        @uploaded="refresh()"
        @removed="refresh()"
      />
    </template>
  </section>
</template>

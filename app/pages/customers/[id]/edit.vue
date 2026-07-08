<script setup lang="ts">
import type { CustomerFormValue } from '~/components/customers/CustomerForm.vue'

definePageMeta({ layout: 'staff' })

const route = useRoute()

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
}

const { data, error } = await useFetch<{ customer: Customer }>(`/api/customers/${route.params.id}`)

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
  form.phone = c.phone ?? ''
  form.billingAddress = { line1: '', city: '', state: '', zip: '', ...c.billingAddress }
  form.serviceAddress = { line1: '', city: '', state: '', zip: '', ...c.serviceAddress }
  form.taxExempt = c.taxExempt
  form.paymentTerms = c.paymentTerms
  form.notes = c.notes ?? ''
})

const busy = ref(false)
const errorMsg = ref('')

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
</script>

<template>
  <section class="page active">
    <div v-if="error" class="card" style="padding:32px; text-align:center; color:#64748b;">
      Customer not found. <NuxtLink to="/customers">Back to customers</NuxtLink>
    </div>
    <template v-else>
      <div class="pagehead">
        <div>
          <h2>Edit account</h2>
          <p>
            <NuxtLink to="/customers">Customers</NuxtLink> /
            <NuxtLink :to="`/customers/${route.params.id}`">{{ data?.customer.displayName }}</NuxtLink> / Edit
          </p>
        </div>
      </div>
      <CustomersCustomerForm
        v-model="form"
        :busy="busy"
        :error="errorMsg"
        submit-label="Save changes"
        @submit="submit"
        @cancel="navigateTo(`/customers/${route.params.id}`)"
      />
    </template>
  </section>
</template>

<script setup lang="ts">
import type { CustomerFormValue } from '~/components/customers/CustomerForm.vue'

definePageMeta({ layout: 'staff' })

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

const busy = ref(false)
const error = ref('')
const formRoot = ref<HTMLElement | null>(null)

const CUSTOMER_SPEECH_SECTIONS = [
  {
    selector: '[data-speech-section="account"]',
    narration: 'Name the account and how they pay.',
  },
  {
    selector: '[data-speech-section="billing"]',
    narration: 'Where do bills go?',
  },
  {
    selector: '[data-speech-section="service"]',
    narration: 'Where is work performed, if different?',
  },
  {
    selector: '[data-speech-section="notes"]',
    narration: 'Add any internal notes.',
  },
]

useFormSectionSpeech(formRoot, CUSTOMER_SPEECH_SECTIONS)

function cleanAddress(a: { line1: string, city: string, state: string, zip: string }) {
  return (a.line1 || a.city || a.state || a.zip) ? a : null
}

async function submit() {
  busy.value = true
  error.value = ''
  try {
    const res = await $fetch<{ customer: { id: string } }>('/api/customers', {
      method: 'POST',
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
    await navigateTo(`/customers/${res.customer.id}`)
  }
  catch (err) {
    const fe = err as { data?: { data?: { message?: string } } }
    error.value = fe.data?.data?.message ?? 'Could not create the customer — check the fields'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="page active">
    <div class="pagehead">
      <div>
        <h2>New customer</h2>
        <p><NuxtLink to="/customers">Customers</NuxtLink> / Create account</p>
      </div>
    </div>
    <div ref="formRoot">
      <CustomersCustomerForm
        v-model="form"
        :busy="busy"
        :error="error"
        submit-label="Create customer"
        @submit="submit"
        @cancel="navigateTo('/customers')"
      />
    </div>
  </section>
</template>

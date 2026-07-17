<script setup lang="ts">
import type { BusinessProfile } from '#shared/workspace-settings-defaults'
import { formatPhoneDisplay } from '#shared/format/phone'

const emit = defineEmits<{ saved: [] }>()

const { data, refresh, pending } = useClientFetch<{ profile: BusinessProfile }>('/api/admin/settings/business')

const form = reactive({
  businessName: '',
  phone: '',
  email: '',
  website: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
  taxId: '',
  defaultTaxRatePercent: '0',
})

watch(() => data.value?.profile, (p) => {
  if (!p) return
  Object.assign(form, { ...p, phone: formatPhoneDisplay(p.phone) })
}, { immediate: true })

const busy = ref(false)
const message = ref('')
const error = ref('')

async function save() {
  busy.value = true
  message.value = ''
  error.value = ''
  try {
    await $fetch('/api/admin/settings/business', {
      method: 'PATCH',
      body: {
        businessName: form.businessName.trim(),
        phone: formatPhoneDisplay(form.phone.trim()),
        email: form.email.trim(),
        website: form.website.trim(),
        addressLine1: form.addressLine1.trim(),
        addressLine2: form.addressLine2.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        postalCode: form.postalCode.trim(),
        country: form.country.trim() || 'US',
        taxId: form.taxId.trim(),
        defaultTaxRatePercent: form.defaultTaxRatePercent.trim() || '0',
      },
    })
    message.value = 'Business profile saved'
    await refresh()
    emit('saved')
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Save failed'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel-head">
      <h3>Business</h3>
      <p>Your shop name, contact details, address, and default sales tax for invoices.</p>
    </header>

    <div v-if="pending" class="card"><div class="cbody">Loading…</div></div>

    <form v-else class="card" @submit.prevent="save">
      <div class="cbody settings-form">
        <label class="fld">
          Business name
          <input v-model="form.businessName" type="text" maxlength="200" placeholder="e.g. Devon Onsite Repairs">
        </label>

        <div class="row2">
          <label class="fld">
            Phone
            <input v-model="form.phone" type="tel" maxlength="40" placeholder="(555) 555 0100" @blur="form.phone = formatPhoneDisplay(form.phone)">
          </label>
          <label class="fld">
            Email
            <input v-model="form.email" type="email" maxlength="200" placeholder="service@yourshop.com">
          </label>
        </div>

        <label class="fld">
          Website
          <input v-model="form.website" type="url" maxlength="300" placeholder="https://yourshop.com">
        </label>

        <label class="fld">
          Address line 1
          <input v-model="form.addressLine1" type="text" maxlength="200">
        </label>
        <label class="fld">
          Address line 2
          <input v-model="form.addressLine2" type="text" maxlength="200" placeholder="Suite, unit, etc.">
        </label>

        <div class="row3">
          <label class="fld">
            City
            <input v-model="form.city" type="text" maxlength="100">
          </label>
          <label class="fld">
            State
            <input v-model="form.state" type="text" maxlength="50">
          </label>
          <label class="fld">
            Postal code
            <input v-model="form.postalCode" type="text" maxlength="20">
          </label>
        </div>

        <label class="fld">
          Country
          <input v-model="form.country" type="text" maxlength="60">
        </label>

        <div class="row2">
          <label class="fld">
            Sales tax ID
            <input v-model="form.taxId" type="text" maxlength="40" placeholder="EIN or state tax ID">
          </label>
          <label class="fld">
            Default tax rate (%)
            <input
              v-model="form.defaultTaxRatePercent"
              type="text"
              inputmode="decimal"
              maxlength="8"
              placeholder="e.g. 6.6"
            >
          </label>
        </div>
        <p class="settings-hint">Applied to new invoices and estimates unless the customer is marked tax exempt.</p>

        <p v-if="message" class="settings-ok">{{ message }}</p>
        <p v-if="error" class="settings-err">{{ error }}</p>

        <div class="settings-actions">
          <button type="submit" class="btn primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save business profile' }}</button>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
@import './settings-panel.css';
.row3 {
  display: grid;
  grid-template-columns: 1fr 1fr 120px;
  gap: 12px;
}
.settings-hint {
  margin: -4px 0 8px;
  font-size: 12.5px;
  color: #64748b;
  line-height: 1.45;
}
@media (max-width: 640px) {
  .row3 { grid-template-columns: 1fr; }
}
</style>

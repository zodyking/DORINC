<script setup lang="ts">
export interface CustomerFormValue {
  displayName: string
  accountKind: 'fleet' | 'individual'
  email: string
  phone: string
  billingAddress: { line1: string, city: string, state: string, zip: string }
  serviceAddress: { line1: string, city: string, state: string, zip: string }
  taxExempt: boolean
  paymentTerms: string
  notes: string
}

const model = defineModel<CustomerFormValue>({ required: true })

defineProps<{
  busy?: boolean
  submitLabel: string
  error?: string
}>()

const emit = defineEmits<{ submit: [], cancel: [] }>()
</script>

<template>
  <form @submit.prevent="emit('submit')">
    <div class="cols">
      <div class="stack">
        <div class="card">
          <div class="chead"><h3>Account</h3></div>
          <div class="cbody">
            <label class="fld">Display name <input v-model="model.displayName" type="text" required placeholder="Company or person name"></label>
            <label class="fld">Account type
              <select v-model="model.accountKind">
                <option value="individual">Individual</option>
                <option value="fleet">Fleet</option>
              </select>
            </label>
            <label class="fld">Email <input v-model="model.email" type="email" placeholder="billing@company.com"></label>
            <label class="fld">Phone <input v-model="model.phone" type="tel" placeholder="(302) 555-0100"></label>
            <label class="fld">Payment terms
              <select v-model="model.paymentTerms">
                <option value="due_on_receipt">Due on receipt</option>
                <option value="net_15">Net 15</option>
                <option value="net_30">Net 30</option>
                <option value="net_45">Net 45</option>
                <option value="net_60">Net 60</option>
              </select>
            </label>
            <div class="tglrow">Tax exempt <span class="tgl"><input v-model="model.taxExempt" type="checkbox"><span class="tr" /></span></div>
          </div>
        </div>
        <div class="card">
          <div class="chead"><h3>Notes</h3></div>
          <div class="cbody">
            <label class="fld">Internal notes <textarea v-model="model.notes" placeholder="Billing preferences, site access, reminders…" /></label>
          </div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="chead"><h3>Billing address</h3></div>
          <div class="cbody">
            <label class="fld">Street <input v-model="model.billingAddress.line1" type="text"></label>
            <label class="fld">City <input v-model="model.billingAddress.city" type="text"></label>
            <label class="fld">State <input v-model="model.billingAddress.state" type="text"></label>
            <label class="fld">ZIP <input v-model="model.billingAddress.zip" type="text"></label>
          </div>
        </div>
        <div class="card">
          <div class="chead"><h3>Service address</h3></div>
          <div class="cbody">
            <label class="fld">Street <input v-model="model.serviceAddress.line1" type="text"></label>
            <label class="fld">City <input v-model="model.serviceAddress.city" type="text"></label>
            <label class="fld">State <input v-model="model.serviceAddress.state" type="text"></label>
            <label class="fld">ZIP <input v-model="model.serviceAddress.zip" type="text"></label>
          </div>
        </div>
      </div>
    </div>
    <p v-if="error" style="color:#dc2626; font-size:13px; margin:12px 0 0;">{{ error }}</p>
    <div class="form-footer">
      <button type="submit" class="btn primary" :disabled="busy">{{ busy ? 'Saving…' : submitLabel }}</button>
      <button type="button" class="btn" :disabled="busy" @click="emit('cancel')">Cancel</button>
      <slot name="footer-extra" />
    </div>
  </form>
</template>

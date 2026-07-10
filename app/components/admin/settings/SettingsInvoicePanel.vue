<script setup lang="ts">
import type { InvoiceWorkspaceSettings } from '#shared/workspace-settings-defaults'

const emit = defineEmits<{ saved: [] }>()

const { data: settingsData, refresh } = await useFetch<{ settings: InvoiceWorkspaceSettings }>('/api/admin/settings/invoice')
const { data: templatesData } = await useFetch<{ items: { id: string, name: string, isDefault: boolean }[] }>('/api/invoice-templates')

const form = reactive({
  defaultPaymentTermsDays: 30,
  shopSuppliesPercent: '3.5',
  managerApprovalThreshold: '5000.00',
})

watch(() => settingsData.value?.settings, (s) => {
  if (!s) return
  Object.assign(form, s)
}, { immediate: true })

const busy = ref(false)
const message = ref('')
const error = ref('')

const defaultTemplate = computed(() => templatesData.value?.items?.find(t => t.isDefault))

async function save() {
  busy.value = true
  message.value = ''
  error.value = ''
  try {
    await $fetch('/api/admin/settings/invoice', {
      method: 'PATCH',
      body: { settings: { ...form } },
    })
    message.value = 'Invoice settings saved'
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
      <h3>Invoice settings</h3>
      <p>Defaults for new invoices, approval thresholds, and template selection.</p>
    </header>

    <div class="card">
      <div class="chead"><h3>Active template</h3></div>
      <div class="cbody">
        <p class="settings-help" style="margin:0 0 12px;">
          <template v-if="defaultTemplate">
            Default template: <b>{{ defaultTemplate.name }}</b>
          </template>
          <template v-else>No default template set.</template>
        </p>
        <NuxtLink class="btn" :to="{ path: '/admin', query: { tab: 'designer' } }">Open template designer</NuxtLink>
      </div>
    </div>

    <form class="card" style="margin-top:16px;" @submit.prevent="save">
      <div class="chead"><h3>Invoice defaults</h3></div>
      <div class="cbody settings-form">
        <label class="fld">
          Payment terms (days)
          <input v-model.number="form.defaultPaymentTermsDays" type="number" min="0" max="365">
        </label>
        <label class="fld">
          Shop supplies default (%)
          <input v-model="form.shopSuppliesPercent" type="text" inputmode="decimal" placeholder="3.5">
        </label>
        <label class="fld">
          Manager approval threshold ($)
          <input v-model="form.managerApprovalThreshold" type="text" inputmode="decimal" placeholder="5000.00">
          <span class="help">Invoices at or above this total require manager approval.</span>
        </label>

        <p v-if="message" class="settings-ok">{{ message }}</p>
        <p v-if="error" class="settings-err">{{ error }}</p>

        <div class="settings-actions">
          <button type="submit" class="btn primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save invoice settings' }}</button>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
@import './settings-panel.css';
</style>

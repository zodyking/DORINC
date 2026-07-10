<script setup lang="ts">
import type { BusinessProfile } from '#shared/workspace-settings-defaults'

const emit = defineEmits<{ saved: [] }>()

const { data, refresh, pending } = await useFetch<{ profile: BusinessProfile }>('/api/admin/settings/business')

const businessName = ref('')

watch(() => data.value?.profile, (p) => {
  if (!p) return
  businessName.value = p.businessName
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
      body: { businessName: businessName.value.trim() },
    })
    message.value = 'Business name saved'
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
      <p>Your shop name as shown on invoices and customer-facing documents.</p>
    </header>

    <div v-if="pending" class="card"><div class="cbody">Loading…</div></div>

    <form v-else class="card" @submit.prevent="save">
      <div class="cbody settings-form">
        <label class="fld">
          Business name
          <input v-model="businessName" type="text" maxlength="200" placeholder="e.g. Devon Onsite Repairs">
        </label>

        <p v-if="message" class="settings-ok">{{ message }}</p>
        <p v-if="error" class="settings-err">{{ error }}</p>

        <div class="settings-actions">
          <button type="submit" class="btn primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save' }}</button>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
@import './settings-panel.css';
</style>

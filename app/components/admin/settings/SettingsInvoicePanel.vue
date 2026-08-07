<script setup lang="ts">
import type { InvoiceWorkspaceSettings } from '#shared/workspace-settings-defaults'
import {
  DEFAULT_INVOICE_LINE_AI_RULE_CARDS,
  DEFAULT_INVOICE_LINE_AI_RULES,
} from '#shared/invoice-line-ai-rules'
import {
  DEFAULT_SERVICE_LOG_EXTRACTION_RULE_CARDS,
  DEFAULT_SERVICE_LOG_EXTRACTION_RULES,
} from '#shared/service-log-extraction-rules'
import { templateOptionLabel } from '~/utils/invoice-template-designer-ui'
import AiRulesEditor from '~/components/admin/settings/AiRulesEditor.vue'

const emit = defineEmits<{ saved: [] }>()

const auth = useAuthStore()
const canManageTemplates = computed(() => auth.loaded && auth.can('templates.manage.all'))

const { data: settingsData, refresh } = useClientFetch<{ settings: InvoiceWorkspaceSettings }>('/api/admin/settings/invoice')
const { data: templatesData, refresh: refreshTemplates } = useClientFetch<{
  items: {
    id: string
    name: string
    isDefault: boolean
    latestVersion?: { status: string } | null
  }[]
}>('/api/invoice-templates')

const form = reactive({
  defaultPaymentTermsDays: 30,
  lineItemAiRules: DEFAULT_INVOICE_LINE_AI_RULES,
  serviceLogExtractionRules: DEFAULT_SERVICE_LOG_EXTRACTION_RULES,
})

watch(() => settingsData.value?.settings, (s) => {
  if (!s) return
  Object.assign(form, s)
}, { immediate: true })

const selectedTemplateId = ref('')
const templateBusy = ref(false)
const templateMessage = ref('')
const templateError = ref('')

watch(templatesData, (list) => {
  if (!list?.items.length) return
  const current = list.items.find(t => t.isDefault) ?? list.items[0]
  if (current && !selectedTemplateId.value) {
    selectedTemplateId.value = current.id
  }
}, { immediate: true })

watch(() => templatesData.value?.items, (items) => {
  const current = items?.find(t => t.isDefault)
  if (current) selectedTemplateId.value = current.id
})

const editorLink = computed(() => ({
  path: '/templates/designer',
  query: selectedTemplateId.value ? { template: selectedTemplateId.value } : {},
}))

const busy = ref(false)
const message = ref('')
const error = ref('')

async function save() {
  busy.value = true
  message.value = ''
  error.value = ''
  try {
    await $fetch('/api/admin/settings/invoice', {
      method: 'PATCH',
      body: {
        settings: {
          defaultPaymentTermsDays: form.defaultPaymentTermsDays,
          shopSuppliesPercent: settingsData.value?.settings.shopSuppliesPercent ?? '3.5',
          managerApprovalThreshold: settingsData.value?.settings.managerApprovalThreshold ?? '5000.00',
          lineItemAiRules: form.lineItemAiRules,
          serviceLogExtractionRules: form.serviceLogExtractionRules,
        },
      },
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

async function onTemplateChange(ev: Event) {
  const id = (ev.target as HTMLSelectElement).value
  if (!canManageTemplates.value) return
  templateBusy.value = true
  templateMessage.value = ''
  templateError.value = ''
  try {
    await $fetch(`/api/invoice-templates/${id}`, {
      method: 'PATCH',
      body: { isDefault: true },
    })
    selectedTemplateId.value = id
    await refreshTemplates()
    templateMessage.value = 'Default invoice template updated app-wide'
    emit('saved')
  }
  catch (e: unknown) {
    templateError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not set default template'
    const current = templatesData.value?.items?.find(t => t.isDefault)
    if (current) selectedTemplateId.value = current.id
  }
  finally {
    templateBusy.value = false
  }
}
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel-head">
      <h3>Invoice settings</h3>
      <p>Defaults for new invoices, approval thresholds, and the app-wide PDF template.</p>
    </header>

    <div class="card">
      <div class="chead"><h3>Invoice template</h3></div>
      <div class="cbody settings-form">
        <label class="fld">
          Default template (app-wide)
          <select
            :value="selectedTemplateId"
            :disabled="!canManageTemplates || templateBusy || !templatesData?.items?.length"
            @change="onTemplateChange"
          >
            <option v-if="!templatesData?.items?.length" value="">No templates available</option>
            <option
              v-for="t in templatesData?.items ?? []"
              :key="t.id"
              :value="t.id"
            >
              {{ templateOptionLabel(t.name, t.isDefault, t.latestVersion?.status) }}
            </option>
          </select>
          <span class="help">Used for all new official invoice PDFs across the workspace.</span>
        </label>

        <p v-if="templateMessage" class="settings-ok">{{ templateMessage }}</p>
        <p v-if="templateError" class="settings-err">{{ templateError }}</p>

        <div class="settings-actions" style="margin-top:12px;">
          <NuxtLink class="btn primary" :to="editorLink">Open template editor</NuxtLink>
        </div>
      </div>
    </div>

    <form class="card" style="margin-top:16px;" @submit.prevent="save">
      <div class="chead"><h3>Invoice defaults</h3></div>
      <div class="cbody settings-form">
        <label class="fld">
          Payment terms (days)
          <input v-model.number="form.defaultPaymentTermsDays" type="number" min="0" max="365">
        </label>

        <p v-if="message" class="settings-ok">{{ message }}</p>
        <p v-if="error" class="settings-err">{{ error }}</p>

        <div class="settings-actions">
          <button type="submit" class="btn primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save invoice settings' }}</button>
        </div>
      </div>
    </form>

    <form class="card" style="margin-top:16px;" @submit.prevent="save">
      <div class="chead"><h3>Line item AI audit rules</h3></div>
      <div class="cbody settings-form">
        <AiRulesEditor
          v-model="form.lineItemAiRules"
          :fallback-cards="DEFAULT_INVOICE_LINE_AI_RULE_CARDS"
          title="Audit rules"
          help="Used before save on the invoice editor. Each rule is edited as its own card; the full set is saved and sent to AI as one JSON string."
        />

        <p v-if="message" class="settings-ok">{{ message }}</p>
        <p v-if="error" class="settings-err">{{ error }}</p>

        <div class="settings-actions">
          <button type="submit" class="btn primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save invoice settings' }}</button>
        </div>
      </div>
    </form>

    <form class="card" style="margin-top:16px;" @submit.prevent="save">
      <div class="chead"><h3>Service log extraction rules</h3></div>
      <div class="cbody settings-form">
        <AiRulesEditor
          v-model="form.serviceLogExtractionRules"
          :fallback-cards="DEFAULT_SERVICE_LOG_EXTRACTION_RULE_CARDS"
          title="Detection & extraction rules"
          help="Applied after page-type classification (handwritten vs printed form). Each rule is a sub-card; the complete list is one JSON string for AI."
        />

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

<script setup lang="ts">
import OpenRouterModelSelector from '~/components/admin/OpenRouterModelSelector.vue'
import {
  aiFeatureLabel,
  formatCapUsage,
  parseOptionalSpendCap,
} from '~/utils/admin-panel-ui'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

const props = defineProps<{ active?: boolean }>()
const emit = defineEmits<{ saved: [] }>()

interface AiSettingsView {
  id: string
  provider: 'openrouter'
  enabled: boolean
  hasApiKey: boolean
  defaultModel: string
  serviceLogExtractionModel: string | null
  invoiceDescriptionModel: string | null
  platformHelpModel: string | null
  serviceLogExtractionEnabled: boolean
  invoiceDescriptionEnabled: boolean
  platformHelpEnabled: boolean
  dailySpendCapUsd: string | null
  monthlySpendCapUsd: string | null
  updatedAt: string
}

interface AiUsageSummary {
  monthStart: string
  totalRuns: number
  byFeature: Record<string, number>
  approvedSuggestions: number
  estimatedCostUsd: number
  dailyCostUsd: number
}

interface AiSpendCaps {
  dailyUsd: number
  monthlyUsd: number
  dailyCapUsd: number | null
  monthlyCapUsd: number | null
  dailyExceeded: boolean
  monthlyExceeded: boolean
  anyExceeded: boolean
}

interface AiUsageLogItem {
  id: string
  featureType: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
  createdAt: string
}

interface AiSettingsResponse {
  settings: AiSettingsView
  usage: AiUsageSummary
  spendCaps: AiSpendCaps
}

const AI_TASKS = [
  {
    key: 'service_log_extraction' as const,
    enabledKey: 'serviceLogExtractionEnabled' as const,
    modelKey: 'serviceLogExtractionModel' as const,
    title: 'Service log extraction',
    description: 'Reads handwritten or photo service logs into structured fields.',
    modelHint: 'Prefer a vision-capable model for photos and scans.',
  },
  {
    key: 'invoice_description' as const,
    enabledKey: 'invoiceDescriptionEnabled' as const,
    modelKey: 'invoiceDescriptionModel' as const,
    title: 'Invoice descriptions & line audit',
    description: 'Rewrites line descriptions and audits invoice lines before send.',
    modelHint: 'A strong text model works well; vision is not required.',
  },
  {
    key: 'platform_help' as const,
    enabledKey: 'platformHelpEnabled' as const,
    modelKey: 'platformHelpModel' as const,
    title: 'Susan (help assistant)',
    description: 'Susan answers in-app help questions for staff.',
    modelHint: 'Use a vision model if staff attach screenshots for Susan.',
  },
]

const { data, pending, refresh } = useClientFetch<AiSettingsResponse>(
  '/api/admin/ai/settings',
  { immediate: false },
)

const { data: usageLogs, refresh: refreshUsageLogs } = useClientFetch<{
  items: AiUsageLogItem[]
  total: number
}>(
  '/api/admin/ai/usage',
  { immediate: false },
)

const loaded = ref(false)

watch(() => props.active, (active) => {
  if (active && !loaded.value) {
    loaded.value = true
    void Promise.all([refresh(), refreshUsageLogs()])
  }
}, { immediate: true })

const form = reactive({
  enabled: false,
  defaultModel: '',
  apiKey: '',
  serviceLogExtractionModel: '',
  invoiceDescriptionModel: '',
  platformHelpModel: '',
  serviceLogExtractionEnabled: true,
  invoiceDescriptionEnabled: true,
  platformHelpEnabled: true,
  dailySpendCapUsd: '' as string | number,
  monthlySpendCapUsd: '' as string | number,
})

let skipHydrate = false

function hydrate(s: AiSettingsView) {
  form.enabled = s.enabled
  form.defaultModel = s.defaultModel
  form.serviceLogExtractionModel = s.serviceLogExtractionModel ?? s.defaultModel
  form.invoiceDescriptionModel = s.invoiceDescriptionModel ?? s.defaultModel
  form.platformHelpModel = s.platformHelpModel ?? s.defaultModel
  form.serviceLogExtractionEnabled = s.serviceLogExtractionEnabled
  form.invoiceDescriptionEnabled = s.invoiceDescriptionEnabled
  form.platformHelpEnabled = s.platformHelpEnabled
  form.dailySpendCapUsd = s.dailySpendCapUsd ?? ''
  form.monthlySpendCapUsd = s.monthlySpendCapUsd ?? ''
  form.apiKey = ''
}

watch(() => data.value?.settings, (s) => {
  if (!s || skipHydrate) return
  hydrate(s)
}, { immediate: true })

type SelectorExpose = { reload: () => Promise<void> }
const catalogSelectorRef = ref<SelectorExpose | null>(null)
const taskSelectorRefs = ref<SelectorExpose[]>([])

function setTaskSelectorRef(el: unknown, index: number) {
  if (!el) return
  taskSelectorRefs.value[index] = el as SelectorExpose
}

async function reloadModelCatalogs() {
  const jobs = [
    catalogSelectorRef.value?.reload(),
    ...taskSelectorRefs.value.map(ref => ref?.reload()),
  ].filter(Boolean)
  await Promise.all(jobs)
}

const saveBusy = ref(false)
const testBusy = ref(false)
const message = ref('')
const error = ref('')

function normalizeTaskModel(value: string, fallback: string): string {
  const trimmed = value.trim()
  return trimmed || fallback
}

async function save() {
  if (saveBusy.value || pending.value) return
  saveBusy.value = true
  message.value = ''
  error.value = ''

  try {
    const fallback = form.defaultModel.trim() || 'anthropic/claude-3.5-sonnet'
    const body: Record<string, unknown> = {
      enabled: form.enabled,
      defaultModel: fallback,
      serviceLogExtractionModel: normalizeTaskModel(form.serviceLogExtractionModel, fallback),
      invoiceDescriptionModel: normalizeTaskModel(form.invoiceDescriptionModel, fallback),
      platformHelpModel: normalizeTaskModel(form.platformHelpModel, fallback),
      serviceLogExtractionEnabled: form.serviceLogExtractionEnabled,
      invoiceDescriptionEnabled: form.invoiceDescriptionEnabled,
      platformHelpEnabled: form.platformHelpEnabled,
      dailySpendCapUsd: parseOptionalSpendCap(form.dailySpendCapUsd),
      monthlySpendCapUsd: parseOptionalSpendCap(form.monthlySpendCapUsd),
    }
    if (form.apiKey.trim()) body.apiKey = form.apiKey.trim()

    const res = await $fetch<{ settings: AiSettingsView }>('/api/admin/ai/settings', {
      method: 'PATCH',
      body,
    })

    skipHydrate = true
    if (data.value) data.value = { ...data.value, settings: res.settings }
    hydrate(res.settings)
    await nextTick()
    skipHydrate = false

    message.value = 'AI settings saved'
    emit('saved')
    try {
      await reloadModelCatalogs()
      await Promise.all([refresh(), refreshUsageLogs()])
    }
    catch (refreshErr: unknown) {
      message.value = 'AI settings saved (status refresh failed — reload if totals look stale)'
      console.warn('[ai-settings] refresh after save failed', refreshErr)
    }
  }
  catch (e: unknown) {
    error.value = syncFetchErrorMessage(e, 'Save failed — check encryption setup and try again')
  }
  finally {
    saveBusy.value = false
  }
}

async function testConnection() {
  if (testBusy.value || saveBusy.value) return
  testBusy.value = true
  message.value = ''
  error.value = ''
  try {
    const res = await $fetch<{ message: string }>('/api/admin/ai/test-connection', {
      method: 'POST',
      body: form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {},
    })
    message.value = res.message
    await reloadModelCatalogs()
  }
  catch (e: unknown) {
    error.value = syncFetchErrorMessage(e, 'Connection test failed')
  }
  finally {
    testBusy.value = false
  }
}

function taskModel(task: typeof AI_TASKS[number]): string {
  return form[task.modelKey]
}

function setTaskModel(task: typeof AI_TASKS[number], value: string) {
  form[task.modelKey] = value
}

function taskEnabled(task: typeof AI_TASKS[number]): boolean {
  return form[task.enabledKey]
}

function setTaskEnabled(task: typeof AI_TASKS[number], value: boolean) {
  form[task.enabledKey] = value
}

function applyFallbackToEmptyTasks() {
  const fallback = form.defaultModel.trim()
  if (!fallback) return
  for (const task of AI_TASKS) {
    if (!form[task.modelKey].trim()) form[task.modelKey] = fallback
  }
}
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel-head">
      <h3>Susan</h3>
      <p>
        Susan is powered by OpenRouter. Pick a model per task, set spend caps, and review usage.
        Keys are encrypted in PostgreSQL and never returned to the browser.
      </p>
    </header>

    <div v-if="pending && !data" class="card">
      <div class="cbody">Loading…</div>
    </div>

    <div v-else-if="data" class="stack">
      <div class="card">
        <div class="chead">
          <div>
            <h3>Connection</h3>
            <p class="ai-card-sub">Provider access and fallback model</p>
          </div>
          <span class="pill indigo">Human approval required</span>
        </div>
        <div class="cbody settings-form">
          <div class="tglrow">
            <div>
              <div class="notif-label">AI enabled</div>
              <div class="notif-desc">Master switch for all AI workflows.</div>
            </div>
            <span class="tgl">
              <input v-model="form.enabled" type="checkbox">
              <span class="tr" />
            </span>
          </div>

          <label class="fld secret-fld">
            OpenRouter API key
            <input
              v-model="form.apiKey"
              type="password"
              :placeholder="data.settings.hasApiKey ? '•••••••• (leave blank to keep)' : 'sk-or-…'"
              autocomplete="off"
            >
          </label>

          <OpenRouterModelSelector
            ref="catalogSelectorRef"
            v-model="form.defaultModel"
            :api-key="form.apiKey"
            :disabled="!form.enabled"
            label="Fallback default model"
            hint="Used when a task model is cleared, and as the starting value for new tasks."
            @update:model-value="applyFallbackToEmptyTasks"
          />

          <div class="settings-actions">
            <button type="button" class="btn" :disabled="testBusy || saveBusy" @click="testConnection">
              {{ testBusy ? 'Testing…' : 'Test connection' }}
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="chead">
          <div>
            <h3>Models by task</h3>
            <p class="ai-card-sub">Each workflow uses its own model</p>
          </div>
        </div>
        <div class="cbody ai-task-list">
          <article
            v-for="(task, index) in AI_TASKS"
            :key="task.key"
            class="ai-task-card"
            :class="{ disabled: !form.enabled || !taskEnabled(task) }"
          >
            <div class="ai-task-card__head">
              <div>
                <h4>{{ task.title }}</h4>
                <p>{{ task.description }}</p>
              </div>
              <span class="tgl">
                <input
                  type="checkbox"
                  :checked="taskEnabled(task)"
                  :disabled="!form.enabled"
                  @change="setTaskEnabled(task, ($event.target as HTMLInputElement).checked)"
                >
                <span class="tr" />
              </span>
            </div>
            <OpenRouterModelSelector
              :ref="(el) => setTaskSelectorRef(el, index)"
              :model-value="taskModel(task)"
              :api-key="form.apiKey"
              :disabled="!form.enabled || !taskEnabled(task)"
              :show-toolbar="index === 0"
              label="Model"
              :hint="task.modelHint"
              @update:model-value="setTaskModel(task, $event)"
            />
          </article>
          <p class="settings-help">
            Turning a task off blocks that workflow for everyone. Model changes apply after you save.
          </p>
        </div>
      </div>

      <div class="card">
        <div class="chead">
          <div>
            <h3>Spend caps</h3>
            <p class="ai-card-sub">Optional USD limits for OpenRouter usage</p>
          </div>
        </div>
        <div class="cbody settings-form">
          <div class="row2">
            <label class="fld">
              Daily spend cap (USD)
              <input v-model="form.dailySpendCapUsd" type="number" min="0" step="0.01" placeholder="No cap">
            </label>
            <label class="fld">
              Monthly spend cap (USD)
              <input v-model="form.monthlySpendCapUsd" type="number" min="0" step="0.01" placeholder="No cap">
            </label>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="chead"><h3>Usage this month</h3></div>
        <dl class="kv">
          <dt>{{ aiFeatureLabel('service_log_extraction') }}</dt>
          <dd>{{ data.usage.byFeature.service_log_extraction ?? 0 }} runs</dd>
          <dt>{{ aiFeatureLabel('invoice_description') }}</dt>
          <dd>{{ data.usage.byFeature.invoice_description ?? 0 }} drafts</dd>
          <dt>{{ aiFeatureLabel('platform_help') }}</dt>
          <dd>{{ data.usage.byFeature.platform_help ?? 0 }} queries</dd>
          <dt>{{ aiFeatureLabel('daily_summary') }}</dt>
          <dd>{{ data.usage.byFeature.daily_summary ?? 0 }} notes</dd>
          <dt>Approved</dt>
          <dd>{{ data.usage.approvedSuggestions }}</dd>
          <dt>Est. cost (month)</dt>
          <dd>${{ data.usage.estimatedCostUsd.toFixed(2) }}</dd>
          <dt>Daily spend</dt>
          <dd>{{ formatCapUsage(data.spendCaps.dailyUsd, data.spendCaps.dailyCapUsd) }}</dd>
          <dt>Monthly spend</dt>
          <dd>{{ formatCapUsage(data.spendCaps.monthlyUsd, data.spendCaps.monthlyCapUsd) }}</dd>
        </dl>
      </div>

      <div v-if="usageLogs?.items?.length" class="card">
        <div class="chead">
          <h3>AI usage log</h3>
          <span class="pill indigo">{{ usageLogs.total }} entries</span>
        </div>
        <div class="tscroll">
          <table class="tbl compact">
            <thead>
              <tr>
                <th>When</th>
                <th>Feature</th>
                <th>Model</th>
                <th class="num">Tokens</th>
                <th class="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in usageLogs.items" :key="row.id">
                <td><span class="mono">{{ new Date(row.createdAt).toLocaleString() }}</span></td>
                <td>{{ aiFeatureLabel(row.featureType) }}</td>
                <td><span class="mono">{{ row.model }}</span></td>
                <td class="num">{{ row.totalTokens }}</td>
                <td class="num">${{ row.estimatedCostUsd.toFixed(4) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p v-if="message" class="settings-ok">{{ message }}</p>
      <p v-if="error" class="settings-err">{{ error }}</p>

      <div class="settings-actions ai-save-bar">
        <button type="button" class="btn primary" :disabled="saveBusy || testBusy || pending" @click="save">
          {{ pending ? 'Loading…' : saveBusy ? 'Saving…' : 'Save AI settings' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import './settings-panel.css';

.stack {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.ai-card-sub {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: #64748b;
}

.notif-label {
  font-size: 13.5px;
  font-weight: 600;
  color: #0f172a;
}

.notif-desc {
  margin-top: 2px;
  font-size: 12.5px;
  color: #64748b;
  line-height: 1.4;
}

.tglrow {
  align-items: flex-start;
}

.ai-task-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ai-task-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}

.ai-task-card.disabled {
  opacity: 0.72;
}

.ai-task-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.ai-task-card__head h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.ai-task-card__head p {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: #64748b;
  line-height: 1.45;
  max-width: 56ch;
}

.ai-save-bar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  padding: 12px 0 calc(12px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, rgba(248, 250, 252, 0) 0%, #f8fafc 28%);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.tbl.compact th,
.tbl.compact td {
  font-size: 12.5px;
  padding: 10px 12px;
}
</style>

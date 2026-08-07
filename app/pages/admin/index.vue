<script setup lang="ts">
// Control Panel — workspace settings, system health, and configuration.
import ControlPanelAccessGate from '~/components/admin/ControlPanelAccessGate.vue'
import ControlPanelBackupRestore from '~/components/admin/ControlPanelBackupRestore.vue'
import ControlPanelDatabaseChart from '~/components/admin/ControlPanelDatabaseChart.vue'
import ControlPanelImportExport from '~/components/admin/ControlPanelImportExport.vue'
import ControlPanelSection from '~/components/admin/ControlPanelSection.vue'
import ControlPanelSystemMonitor from '~/components/admin/ControlPanelSystemMonitor.vue'
import SettingsBusinessPanel from '~/components/admin/settings/SettingsBusinessPanel.vue'
import SettingsEmailPanel from '~/components/admin/settings/SettingsEmailPanel.vue'
import SettingsImapPanel from '~/components/admin/settings/SettingsImapPanel.vue'
import SettingsNotificationsPanel from '~/components/admin/settings/SettingsNotificationsPanel.vue'
import SettingsInvoicePanel from '~/components/admin/settings/SettingsInvoicePanel.vue'
import SettingsCatalogPanel from '~/components/admin/settings/SettingsCatalogPanel.vue'
import SettingsLineDetectionPanel from '~/components/admin/settings/SettingsLineDetectionPanel.vue'
import SettingsBillingPanel from '~/components/admin/settings/SettingsBillingPanel.vue'
import SettingsAiPanel from '~/components/admin/settings/SettingsAiPanel.vue'
import SettingsChatPanel from '~/components/admin/settings/SettingsChatPanel.vue'
import { BRAND_NAME } from '~/constants/brand'
import {
  aiFeatureLabel,
  aiHealthTone,
  backupHealthTone,
  securitySectionTone,
  smtpHealthTone,
  suspiciousAlertRuleLabel,
  suspiciousAlertSeverityClass,
  formatSuspiciousAlertUser,
  formatSuspiciousAlertIps,
  workerQueueStatusLabel,
} from '~/utils/admin-panel-ui'
import {
  CONTROL_PANEL_GROUPS,
  CONTROL_PANEL_SECTION_IDS,
  emptyControlPanelOpenState,
  type ControlPanelSectionId,
} from '~/utils/control-panel-nav'

definePageMeta({ layout: 'staff', permission: 'system.admin.all' })

const auth = useAuthStore()

interface SystemStatus {
  database: 'ok' | 'error'
  dbLatencyMs: number | null
  version: string
  smtp: {
    configured: boolean
    host: string | null
    port: number
    from: string | null
  }
  backup: {
    status: 'not_configured' | 'healthy' | 'error'
    message: string
    lastRunAt: string | null
    lastFilename: string | null
    scheduleEnabled: boolean
    scheduleLabel: string
    driveConnected: boolean
    driveAccountEmail: string | null
  }
  ai: {
    status: 'not_configured' | 'disabled' | 'active' | 'error'
    message: string
    defaultModel: string | null
    hasApiKey: boolean
    enabled: boolean
    monthlyCostUsd: number
  }
  pdfWorker: {
    status: 'running' | 'idle' | 'backlog' | 'error' | 'unknown'
    message: string
    queued: number
    processing: number
    failed: number
    lastSuccessAt: string | null
  }
  workerQueue: {
    status: 'healthy' | 'idle' | 'backlog' | 'error'
    message: string
    queued: number
    processing: number
    failed: number
    byType: Record<string, { queued: number, processing: number, failed: number }>
    lastActivityAt: string | null
  }
}

interface SuspiciousAlertItem {
  id: string
  ruleKey: string
  severity: string
  title: string
  description: string
  actorUserId: string | null
  actorName: string | null
  actorEmail: string | null
  ipAddress: string | null
  ipAddresses: string[]
  status: string
  createdAt: string
}

const { data: suspiciousAlerts, refresh: refreshSuspiciousAlerts } = useClientFetch<{ items: SuspiciousAlertItem[] }>(
  '/api/admin/security/suspicious-activity',
)

const dismissAlertBusy = ref<string | null>(null)

const openSections = reactive(emptyControlPanelOpenState())
const overviewOpen = ref(true)

const route = useRoute()
const router = useRouter()
const cpGroups = CONTROL_PANEL_GROUPS

onMounted(() => {
  // Keep first paint light on phones — jump chips surface config first.
  if (window.matchMedia('(max-width: 720px)').matches) {
    overviewOpen.value = false
  }
})

function setSectionOpen(id: ControlPanelSectionId, open: boolean) {
  if (open) {
    // One section at a time — keeps the panel scannable on mobile.
    for (const key of CONTROL_PANEL_SECTION_IDS) {
      openSections[key] = key === id
    }
    router.replace({ query: { ...route.query, tab: id } })
    return
  }

  openSections[id] = false
  if (route.query.tab === id) {
    const { tab: _tab, ...rest } = route.query
    router.replace({ query: rest })
  }
}

function jumpToSection(id: ControlPanelSectionId) {
  setSectionOpen(id, true)
  nextTick(() => {
    document.getElementById(`cp-section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function toggleOverview() {
  overviewOpen.value = !overviewOpen.value
  if (overviewOpen.value) {
    nextTick(() => {
      document.getElementById('cp-overview')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
}

watch(() => route.query.tab, (tab) => {
  if (typeof tab === 'string' && CONTROL_PANEL_SECTION_IDS.includes(tab as ControlPanelSectionId)) {
    const id = tab as ControlPanelSectionId
    for (const key of CONTROL_PANEL_SECTION_IDS) {
      openSections[key] = key === id
    }
    nextTick(() => {
      document.getElementById(`cp-section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
}, { immediate: true })

function formatBackupWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

async function dismissSuspiciousAlert(alertId: string) {
  dismissAlertBusy.value = alertId
  try {
    await $fetch(`/api/admin/security/suspicious-activity/${alertId}/dismiss`, { method: 'POST' })
    await refreshSuspiciousAlerts()
  }
  finally {
    dismissAlertBusy.value = null
  }
}

const { data: status, refresh, error } = useClientFetch<SystemStatus>('/api/admin/system/status')

const monitorStatus = computed(() => {
  if (!status.value) return null
  return {
    database: status.value.database,
    dbLatencyMs: status.value.dbLatencyMs,
    version: status.value.version,
    brandName: BRAND_NAME,
    smtp: status.value.smtp,
    backup: {
      status: status.value.backup.status,
      message: status.value.backup.message,
    },
    ai: status.value.ai ?? null,
    pdfWorker: status.value.pdfWorker,
    workerQueue: status.value.workerQueue,
  }
})

const securityTone = computed(() => {
  if (!status.value) return undefined
  return securitySectionTone(
    status.value.workerQueue.status,
    suspiciousAlerts.value?.items?.length ?? 0,
  )
})

const canManageAi = computed(() => auth.can('ai.admin.all'))

</script>

<template>
  <section class="page active cp-page">
    <StaffPageHead subtitle="System monitoring, workspace configuration, and administration">
      <template #title>Control Panel</template>
      <template #actions>
        <NuxtLink to="/setup" class="btn primary">Server Setup Wizard</NuxtLink>
      </template>
    </StaffPageHead>

    <div v-if="error" class="card" style="padding:24px; margin-bottom:16px;">
      <p>You do not have access to the Control Panel.</p>
      <NuxtLink to="/dashboard" class="btn">Back To Dashboard</NuxtLink>
    </div>

    <template v-else-if="status">
      <nav class="cp-jump" aria-label="Control Panel sections">
        <div class="cp-jump-scroll">
          <button
            type="button"
            class="cp-jump-chip"
            :class="{ on: overviewOpen }"
            @click="toggleOverview"
          >
            Overview
          </button>
          <template v-for="group in cpGroups" :key="group.id">
            <span class="cp-jump-group" aria-hidden="true">{{ group.label }}</span>
            <button
              v-for="section in group.sections"
              :key="section.id"
              type="button"
              class="cp-jump-chip"
              :class="{ on: openSections[section.id] }"
              @click="jumpToSection(section.id)"
            >
              {{ section.title }}
            </button>
          </template>
        </div>
      </nav>

      <div id="cp-overview" class="admin-overview">
        <details class="cp-overview-panel" :open="overviewOpen" @toggle="overviewOpen = ($event.target as HTMLDetailsElement).open">
          <summary class="cp-overview-summary">
            <span>
              <b>System Overview</b>
              <small>Storage health and live service status</small>
            </span>
            <span class="cp-overview-chev" aria-hidden="true">▸</span>
          </summary>
          <div class="cp-overview-body">
            <ControlPanelDatabaseChart hero />
            <ControlPanelSystemMonitor
              v-if="monitorStatus"
              :status="monitorStatus"
            />
          </div>
        </details>
      </div>

      <div class="cp-sections">
        <template v-for="group in cpGroups" :key="group.id">
          <p class="cp-sections-label">{{ group.label }}</p>

          <template v-for="section in group.sections" :key="section.id">
            <ControlPanelSection
              v-if="section.id === 'business'"
              :id="section.id"
              :title="section.title"
              :icon="section.icon"
              :subtitle="section.subtitle"
              :open="openSections.business"
              @update:open="setSectionOpen('business', $event)"
            >
              <SettingsBusinessPanel @saved="refresh()" />
            </ControlPanelSection>

            <ControlPanelSection
              v-else-if="section.id === 'invoice'"
              :id="section.id"
              :title="section.title"
              :icon="section.icon"
              :subtitle="section.subtitle"
              :open="openSections.invoice"
              @update:open="setSectionOpen('invoice', $event)"
            >
              <SettingsInvoicePanel @saved="refresh()" />
            </ControlPanelSection>

            <ControlPanelSection
              v-else-if="section.id === 'catalog'"
              :id="section.id"
              :title="section.title"
              :icon="section.icon"
              :subtitle="section.subtitle"
              :open="openSections.catalog"
              @update:open="setSectionOpen('catalog', $event)"
            >
              <SettingsCatalogPanel />
            </ControlPanelSection>

            <ControlPanelSection
              v-else-if="section.id === 'line-detection'"
              :id="section.id"
              :title="section.title"
              :icon="section.icon"
              :subtitle="section.subtitle"
              :open="openSections['line-detection']"
              @update:open="setSectionOpen('line-detection', $event)"
            >
              <SettingsLineDetectionPanel />
            </ControlPanelSection>

            <ControlPanelSection
              v-else-if="section.id === 'chat'"
              :id="section.id"
              :title="section.title"
              :icon="section.icon"
              :subtitle="section.subtitle"
              :open="openSections.chat"
              @update:open="setSectionOpen('chat', $event)"
            >
              <SettingsChatPanel @saved="refresh()" />
            </ControlPanelSection>

            <ControlPanelSection
              v-else-if="section.id === 'notifications'"
              :id="section.id"
              :title="section.title"
              :icon="section.icon"
              :subtitle="section.subtitle"
              :open="openSections.notifications"
              @update:open="setSectionOpen('notifications', $event)"
            >
              <SettingsNotificationsPanel @saved="refresh()" />
            </ControlPanelSection>

            <ControlPanelSection
              v-else-if="section.id === 'email'"
              :id="section.id"
              :title="section.title"
              :icon="section.icon"
              :subtitle="section.subtitle"
              :status-tone="smtpHealthTone(status.smtp.configured)"
              :open="openSections.email"
              @update:open="setSectionOpen('email', $event)"
            >
              <SettingsEmailPanel @saved="refresh()" />
              <SettingsImapPanel @saved="refresh()" />
            </ControlPanelSection>

            <ControlPanelSection
              v-else-if="section.id === 'billing'"
              :id="section.id"
              :title="section.title"
              :icon="section.icon"
              :subtitle="section.subtitle"
              :open="openSections.billing"
              @update:open="setSectionOpen('billing', $event)"
            >
              <SettingsBillingPanel :active="openSections.billing" @saved="refresh()" />
            </ControlPanelSection>

            <ControlPanelSection
              v-else-if="section.id === 'ai'"
              :id="section.id"
              :title="section.title"
              :icon="section.icon"
              :subtitle="section.subtitle"
              :status-tone="status.ai ? aiHealthTone(status.ai.status) : undefined"
              :open="openSections.ai"
              @update:open="setSectionOpen('ai', $event)"
            >
              <SettingsAiPanel
                v-if="canManageAi"
                :active="openSections.ai"
                @saved="refresh()"
              />
              <div v-else class="card">
                <div class="cbody">You need AI admin permission to manage these settings.</div>
              </div>
            </ControlPanelSection>

            <ControlPanelSection
              v-else-if="section.id === 'import'"
              :id="section.id"
              :title="section.title"
              :icon="section.icon"
              :subtitle="section.subtitle"
              :open="openSections.import"
              @update:open="setSectionOpen('import', $event)"
            >
              <ControlPanelImportExport />
            </ControlPanelSection>

            <ControlPanelSection
              v-else-if="section.id === 'backup'"
              :id="section.id"
              :title="section.title"
              :icon="section.icon"
              :subtitle="section.subtitle"
              :status-tone="backupHealthTone(status.backup.status)"
              :open="openSections.backup"
              @update:open="setSectionOpen('backup', $event)"
            >
              <ControlPanelBackupRestore
                :backup-status="status.backup"
                @refreshed="refresh()"
              />
            </ControlPanelSection>

            <ControlPanelSection
              v-else-if="section.id === 'security'"
              :id="section.id"
              :title="section.title"
              :icon="section.icon"
              :subtitle="section.subtitle"
              :status-tone="securityTone"
              :open="openSections.security"
              @update:open="setSectionOpen('security', $event)"
            >
              <div class="stack">
                <ControlPanelAccessGate />

                <div class="card">
                  <div class="chead">
                    <h3>Suspicious Activity</h3>
                    <div class="right">
                      <span class="pill" :class="(suspiciousAlerts?.items?.length ?? 0) > 0 ? 'warn' : 'ok'">
                        {{ suspiciousAlerts?.items?.length ?? 0 }} open
                      </span>
                    </div>
                  </div>
                  <div v-if="suspiciousAlerts?.items?.length" class="tscroll">
                    <table class="tbl">
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Rule</th>
                          <th>Severity</th>
                          <th>User</th>
                          <th>IP Address(es)</th>
                          <th>Summary</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="alert in suspiciousAlerts.items" :key="alert.id">
                          <td><span class="mono" style="font-size:12px">{{ formatBackupWhen(alert.createdAt) }}</span></td>
                          <td>{{ suspiciousAlertRuleLabel(alert.ruleKey) }}</td>
                          <td><span class="pill" :class="suspiciousAlertSeverityClass(alert.severity)">{{ alert.severity }}</span></td>
                          <td>{{ formatSuspiciousAlertUser(alert) }}</td>
                          <td><span class="mono" style="font-size:12px">{{ formatSuspiciousAlertIps(alert) }}</span></td>
                          <td>
                            <div>{{ alert.title }}</div>
                            <div v-if="alert.description" style="font-size:12px; color:#64748b; margin-top:2px;">
                              {{ alert.description }}
                            </div>
                          </td>
                          <td>
                            <button
                              class="btn sm"
                              :disabled="dismissAlertBusy === alert.id"
                              @click="dismissSuspiciousAlert(alert.id)"
                            >
                              {{ dismissAlertBusy === alert.id ? '…' : 'Dismiss' }}
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p v-else class="cbody" style="font-size:13px; color:#64748b; margin:0;">
                    No open alerts — basic rules monitor failed login bursts, off-hours admin actions, high-risk bursts, and restore attempts.
                  </p>
                </div>

                <div class="card">
                  <div class="chead"><h3>Worker Queue</h3></div>
                  <dl class="kv">
                    <dt>Status</dt>
                    <dd>{{ workerQueueStatusLabel(status.workerQueue.status) }}</dd>
                    <dt>Queued</dt>
                    <dd>{{ status.workerQueue.queued }}</dd>
                    <dt>Processing</dt>
                    <dd>{{ status.workerQueue.processing }}</dd>
                    <dt>Failed</dt>
                    <dd>{{ status.workerQueue.failed }}</dd>
                    <dt>Last Activity</dt>
                    <dd>{{ formatBackupWhen(status.workerQueue.lastActivityAt) }}</dd>
                  </dl>
                  <div v-if="Object.keys(status.workerQueue.byType).length" class="tscroll" style="margin-top:0;">
                    <table class="tbl">
                      <thead>
                        <tr>
                          <th>Job Type</th>
                          <th class="num">Queued</th>
                          <th class="num">Active</th>
                          <th class="num">Failed</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(counts, jobType) in status.workerQueue.byType" :key="jobType">
                          <td>{{ aiFeatureLabel(String(jobType)) }}</td>
                          <td class="num">{{ counts.queued }}</td>
                          <td class="num">{{ counts.processing }}</td>
                          <td class="num">{{ counts.failed }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </ControlPanelSection>
          </template>
        </template>
      </div>
    </template>
  </section>
</template>

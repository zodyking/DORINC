// Super Admin control panel helpers (mockup: PAGE: SUPER ADMIN CONTROL PANEL / P1-34).

export type HealthTone = 'ok' | 'warn' | 'bad'

export function databaseHealthTone(status: 'ok' | 'error'): HealthTone {
  return status === 'ok' ? 'ok' : 'bad'
}

export function smtpHealthTone(configured: boolean): HealthTone {
  return configured ? 'ok' : 'warn'
}

export function backupHealthTone(status: 'not_configured' | 'healthy' | 'error'): HealthTone {
  switch (status) {
    case 'healthy': return 'ok'
    case 'error': return 'bad'
    default: return 'warn'
  }
}

export function formatDbLatency(ms: number | null): string {
  if (ms == null) return 'Unavailable'
  return `${ms} ms ping`
}

export function smtpSummary(host: string | null, port: number, configured: boolean): string {
  if (!configured || !host) return 'Not configured — set up SMTP in Control Panel → Email'
  return `${host}:${port} · TLS`
}

export function backupStatusLabel(status: 'not_configured' | 'healthy' | 'error'): string {
  switch (status) {
    case 'healthy': return 'Healthy'
    case 'error': return 'Failed'
    default: return 'Not configured'
  }
}

export function driveConnectionLabel(connected: boolean, email: string | null): string {
  if (!connected) return 'Not connected'
  return email ? `Connected as ${email}` : 'Connected'
}

export function driveConnectionTone(connected: boolean): HealthTone {
  return connected ? 'ok' : 'warn'
}

export function backupDestinationLabel(driveConnected: boolean): string {
  return driveConnected ? 'Database + Google Drive (encrypted)' : 'Encrypted archive in database'
}

export function formatBackupSize(bytes: number): string {
  if (bytes <= 0) return '—'
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function formatDatabaseSizeGb(bytes: number): string {
  if (bytes <= 0) return '0.00 GB'
  return `${(bytes / (1024 ** 3)).toFixed(2)} GB`
}

export function formatDatabaseSizeDelta(bytes: number, percent: number | null): string {
  const sign = bytes > 0 ? '+' : ''
  const gb = formatDatabaseSizeGb(Math.abs(bytes)).replace(' GB', '')
  const pct = percent != null ? ` (${sign}${percent.toFixed(1)}%)` : ''
  if (bytes === 0) return 'No change'
  return `${sign}${gb} GB${pct}`
}

export function backupRunStatusClass(status: string): string {
  if (status === 'completed') return 'ok'
  if (status === 'failed') return 'over'
  return 'warn'
}

export function formatScheduleDisplay(enabled: boolean, label: string): string {
  return enabled ? label : 'Manual only'
}

export type AiHealthStatus = 'not_configured' | 'disabled' | 'active' | 'error'

export function aiHealthTone(status: AiHealthStatus): HealthTone {
  switch (status) {
    case 'active': return 'ok'
    case 'disabled': return 'warn'
    case 'error': return 'bad'
    default: return 'warn'
  }
}

export function aiStatusLabel(status: AiHealthStatus): string {
  switch (status) {
    case 'active': return 'Active'
    case 'disabled': return 'Disabled'
    case 'error': return 'Error'
    default: return 'Not configured'
  }
}

export function formatAiCost(usd: number): string {
  return `$${usd.toFixed(2)} MTD`
}

export function formatCapUsage(current: number, cap: number | null): string {
  if (cap == null) return `$${current.toFixed(2)} · no cap`
  return `$${current.toFixed(2)} / $${cap.toFixed(2)}`
}

export function aiFeatureLabel(feature: string): string {
  switch (feature) {
    case 'service_log_extraction': return 'Extractions'
    case 'invoice_description': return 'Descriptions'
    case 'platform_help': return 'Help queries'
    case 'thumbnail_generate': return 'Thumbnails'
    case 'email_send': return 'Email'
    case 'backup_run': return 'Backups'
    case 'backup_verify': return 'Backup verify'
    case 'service_log_ai_extraction': return 'Log extraction'
    case 'invoice_description_ai': return 'Descriptions'
    default: return feature.replace(/_/g, ' ')
  }
}

export type PdfWorkerStatus = 'running' | 'idle' | 'backlog' | 'error' | 'unknown'
export type WorkerQueueStatus = 'healthy' | 'idle' | 'backlog' | 'error'

export function pdfWorkerHealthTone(status: PdfWorkerStatus): HealthTone {
  switch (status) {
    case 'running':
    case 'idle': return 'ok'
    case 'backlog': return 'warn'
    default: return 'bad'
  }
}

export function pdfWorkerStatusLabel(status: PdfWorkerStatus): string {
  switch (status) {
    case 'running': return 'Running'
    case 'idle': return 'Idle'
    case 'backlog': return 'Backlog'
    case 'error': return 'Error'
    default: return 'Unknown'
  }
}

export function workerQueueHealthTone(status: WorkerQueueStatus): HealthTone {
  switch (status) {
    case 'healthy':
    case 'idle': return 'ok'
    case 'backlog': return 'warn'
    default: return 'bad'
  }
}

export function workerQueueStatusLabel(status: WorkerQueueStatus): string {
  switch (status) {
    case 'healthy': return 'Healthy'
    case 'idle': return 'Idle'
    case 'backlog': return 'Backlog'
    default: return 'Error'
  }
}

export function recoveryTestStatusClass(status: string): string {
  if (status === 'passed') return 'ok'
  if (status === 'failed') return 'over'
  return 'warn'
}

export function suspiciousAlertSeverityClass(severity: string): string {
  if (severity === 'high') return 'over'
  if (severity === 'medium') return 'warn'
  return 'gray'
}

export function suspiciousAlertRuleLabel(ruleKey: string): string {
  switch (ruleKey) {
    case 'auth.failed_login_burst': return 'Failed logins'
    case 'auth.off_hours_admin': return 'Off-hours admin'
    case 'audit.high_risk_burst': return 'High-risk burst'
    case 'backup.restore_attempt': return 'Backup restore'
    default: return ruleKey
  }
}

export interface SuspiciousAlertActorView {
  actorUserId?: string | null
  actorName?: string | null
  actorEmail?: string | null
}

export interface SuspiciousAlertIpView {
  ipAddress?: string | null
  ipAddresses?: string[]
}

export function formatSuspiciousAlertUser(alert: SuspiciousAlertActorView): string {
  if (alert.actorName && alert.actorEmail) return `${alert.actorName} (${alert.actorEmail})`
  if (alert.actorEmail) return alert.actorEmail
  if (alert.actorName) return alert.actorName
  if (alert.actorUserId) return alert.actorUserId
  return '—'
}

export function formatSuspiciousAlertIps(alert: SuspiciousAlertIpView): string {
  const ips = alert.ipAddresses?.length
    ? alert.ipAddresses
    : alert.ipAddress
      ? [alert.ipAddress]
      : []
  if (!ips.length) return '—'
  return ips.join(', ')
}

export interface SystemMonitorStatusInput {
  database: 'ok' | 'error'
  dbLatencyMs: number | null
  version: string
  brandName: string
  smtp: {
    configured: boolean
    host: string | null
    port: number
  }
  backup: {
    status: 'not_configured' | 'healthy' | 'error'
    message: string
  }
  ai: {
    status: AiHealthStatus
    defaultModel: string | null
    hasApiKey: boolean
    monthlyCostUsd: number
  } | null
  pdfWorker: {
    status: PdfWorkerStatus
    message: string
  }
  workerQueue: {
    status: WorkerQueueStatus
    message: string
  }
}

export interface SystemMonitorItem {
  id: string
  label: string
  tone: HealthTone
  summary: string
  statusText: string
}

export function buildSystemMonitorItems(status: SystemMonitorStatusInput): SystemMonitorItem[] {
  const items: SystemMonitorItem[] = [
    {
      id: 'database',
      label: 'PostgreSQL',
      tone: databaseHealthTone(status.database),
      summary: formatDbLatency(status.dbLatencyMs),
      statusText: status.database === 'ok' ? 'Connected' : 'Error',
    },
    {
      id: 'smtp',
      label: 'SMTP',
      tone: smtpHealthTone(status.smtp.configured),
      summary: smtpSummary(status.smtp.host, status.smtp.port, status.smtp.configured),
      statusText: status.smtp.configured ? 'Configured' : 'Action needed',
    },
    {
      id: 'app',
      label: 'App version',
      tone: 'ok',
      summary: `${status.brandName} v${status.version}`,
      statusText: 'Running',
    },
    {
      id: 'pdf-worker',
      label: 'PDF worker',
      tone: pdfWorkerHealthTone(status.pdfWorker.status),
      summary: status.pdfWorker.message,
      statusText: pdfWorkerStatusLabel(status.pdfWorker.status),
    },
    {
      id: 'worker-queue',
      label: 'Worker queue',
      tone: workerQueueHealthTone(status.workerQueue.status),
      summary: status.workerQueue.message,
      statusText: workerQueueStatusLabel(status.workerQueue.status),
    },
    {
      id: 'backup',
      label: 'Backup',
      tone: backupHealthTone(status.backup.status),
      summary: status.backup.message,
      statusText: backupStatusLabel(status.backup.status),
    },
  ]

  if (status.ai) {
    items.push({
      id: 'ai',
      label: 'OpenRouter AI',
      tone: aiHealthTone(status.ai.status),
      summary: `${status.ai.defaultModel ?? 'No model'} · ${status.ai.hasApiKey ? 'key set' : 'no key'} · ${formatAiCost(status.ai.monthlyCostUsd)}`,
      statusText: aiStatusLabel(status.ai.status),
    })
  }

  return items
}

export function securitySectionTone(
  workerQueueStatus: WorkerQueueStatus,
  openAlertCount: number,
): HealthTone {
  if (openAlertCount > 0) return 'bad'
  if (workerQueueStatus === 'backlog' || workerQueueStatus === 'error') {
    return workerQueueStatus === 'error' ? 'bad' : 'warn'
  }
  return 'ok'
}

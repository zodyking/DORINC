import { describe, expect, it } from 'vitest'
import {
  aiFeatureLabel,
  aiHealthTone,
  aiStatusLabel,
  backupDestinationLabel,
  backupHealthTone,
  backupRunStatusClass,
  backupStatusLabel,
  buildSystemMonitorItems,
  databaseHealthTone,
  driveConnectionLabel,
  formatAiCost,
  formatBackupSize,
  formatDbLatency,
  formatScheduleDisplay,
  pdfWorkerHealthTone,
  pdfWorkerStatusLabel,
  securitySectionTone,
  smtpHealthTone,
  smtpSummary,
  workerQueueHealthTone,
  workerQueueStatusLabel,
} from '../../app/utils/admin-panel-ui'

describe('admin-panel-ui helpers (P1-34)', () => {
  it('maps database status to health tones', () => {
    expect(databaseHealthTone('ok')).toBe('ok')
    expect(databaseHealthTone('error')).toBe('bad')
  })

  it('maps SMTP configuration to health tones', () => {
    expect(smtpHealthTone(true)).toBe('ok')
    expect(smtpHealthTone(false)).toBe('warn')
  })

  it('formats DB latency for display', () => {
    expect(formatDbLatency(42)).toBe('42 ms ping')
    expect(formatDbLatency(null)).toBe('Unavailable')
  })

  it('summarizes SMTP settings', () => {
    expect(smtpSummary('smtp.example.com', 587, true)).toContain('smtp.example.com')
    expect(smtpSummary(null, 587, false)).toMatch(/Not configured/)
  })

  it('labels backup placeholder status', () => {
    expect(backupStatusLabel('not_configured')).toBe('Not configured')
    expect(backupHealthTone('not_configured')).toBe('warn')
    expect(driveConnectionLabel(false, null)).toBe('Not connected')
    expect(driveConnectionLabel(true, 'backups@dorinc.local')).toContain('backups@dorinc.local')
    expect(backupDestinationLabel(true)).toContain('Google Drive')
    expect(formatBackupSize(2 * 1024 * 1024)).toBe('2.00 MB')
    expect(backupRunStatusClass('completed')).toBe('ok')
    expect(formatScheduleDisplay(true, 'Nightly · 2:00 AM UTC')).toContain('Nightly')
    expect(formatScheduleDisplay(false, 'Nightly · 2:00 AM UTC')).toBe('Manual only')
  })

  it('maps AI health status to tones and labels', () => {
    expect(aiHealthTone('active')).toBe('ok')
    expect(aiHealthTone('not_configured')).toBe('warn')
    expect(aiStatusLabel('active')).toBe('Active')
    expect(formatAiCost(4.12)).toBe('$4.12 MTD')
    expect(aiFeatureLabel('service_log_extraction')).toBe('Extractions')
  })

  it('maps PDF worker and worker queue health (P2-21)', () => {
    expect(pdfWorkerHealthTone('running')).toBe('ok')
    expect(pdfWorkerHealthTone('backlog')).toBe('warn')
    expect(pdfWorkerHealthTone('error')).toBe('bad')
    expect(pdfWorkerStatusLabel('idle')).toBe('Idle')
    expect(workerQueueHealthTone('healthy')).toBe('ok')
    expect(workerQueueHealthTone('error')).toBe('bad')
    expect(workerQueueStatusLabel('backlog')).toBe('Backlog')
    expect(aiFeatureLabel('email_send')).toBe('Email')
  })

  it('builds compact system monitor items from status payload', () => {
    const items = buildSystemMonitorItems({
      database: 'ok',
      dbLatencyMs: 12,
      version: '1.1.0',
      brandName: 'DOBINCI',
      smtp: { configured: true, host: 'smtp.gmail.com', port: 587 },
      backup: { status: 'not_configured', message: 'No encrypted backups yet' },
      ai: {
        status: 'active',
        defaultModel: 'anthropic/claude-3.5-sonnet',
        hasApiKey: true,
        monthlyCostUsd: 4.12,
      },
      pdfWorker: { status: 'idle', message: 'Queue idle · 0 failed' },
      workerQueue: { status: 'idle', message: 'All queues idle · 0 pending' },
    })

    expect(items).toHaveLength(7)
    expect(items[0]?.label).toBe('PostgreSQL')
    expect(items[0]?.tone).toBe('ok')
    expect(items.find(item => item.id === 'ai')?.statusText).toBe('Active')
  })

  it('maps security section tone from alerts and worker queue', () => {
    expect(securitySectionTone('idle', 0)).toBe('ok')
    expect(securitySectionTone('backlog', 0)).toBe('warn')
    expect(securitySectionTone('idle', 2)).toBe('bad')
  })
})

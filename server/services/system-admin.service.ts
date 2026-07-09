import { sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { getSmtpConfig } from './app-config.service'
import { sendMail } from '../mail/mailer'
import {
  buildStyledEmail,
  emailMuted,
  emailParagraph,
  escapeHtml,
} from '../mail/email-layout'
import { getBackupHealth } from './backups.service'
import { getAiHealth, getMonthlyUsageCost } from './ai-provider.service'
import { getPdfWorkerHealth, getWorkerQueueHealth, type PdfWorkerHealth, type WorkerQueueHealth } from './worker-health.service'
import pkg from '../../package.json'
import { BRAND_NAME } from '../../shared/brand'

export interface SystemStatus {
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
  pdfWorker: PdfWorkerHealth
  workerQueue: WorkerQueueHealth
}

export async function getSystemStatus(db: Db): Promise<SystemStatus> {
  const start = Date.now()
  let database: 'ok' | 'error' = 'ok'
  let dbLatencyMs: number | null = null

  try {
    await db.execute(sql`select 1`)
    dbLatencyMs = Date.now() - start
  }
  catch {
    database = 'error'
  }

  const smtp = getSmtpConfig()
  const host = smtp?.host?.trim() || null
  const from = smtp?.from?.trim() || null
  const [backup, aiHealth, monthlyCostUsd, pdfWorker, workerQueue] = await Promise.all([
    getBackupHealth(db),
    getAiHealth(db),
    getMonthlyUsageCost(db),
    getPdfWorkerHealth(db),
    getWorkerQueueHealth(db),
  ])

  return {
    database,
    dbLatencyMs,
    version: pkg.version ?? '0.0.0',
    smtp: {
      configured: !!(host && from),
      host,
      port: smtp?.port ?? Number(process.env.SMTP_PORT ?? 587),
      from,
    },
    backup: {
      status: backup.status,
      message: backup.message,
      lastRunAt: backup.lastRun?.finishedAt?.toISOString() ?? backup.lastRun?.createdAt?.toISOString() ?? null,
      lastFilename: backup.lastRun?.filename ?? null,
      scheduleEnabled: backup.scheduleEnabled,
      scheduleLabel: backup.scheduleLabel,
      driveConnected: backup.driveConnected,
      driveAccountEmail: backup.driveAccountEmail,
    },
    ai: {
      status: aiHealth.status,
      message: aiHealth.message,
      defaultModel: aiHealth.defaultModel,
      hasApiKey: aiHealth.hasApiKey,
      enabled: aiHealth.enabled,
      monthlyCostUsd,
    },
    pdfWorker,
    workerQueue,
  }
}

export async function sendSmtpTest(to: string, actorName: string): Promise<{ delivered: boolean }> {
  const sentAt = new Date().toISOString()
  const mail = buildStyledEmail({
    subject: `${BRAND_NAME} SMTP test`,
    text: [
      `This is a test message from the ${BRAND_NAME} Super Admin control panel.`,
      '',
      `Sent by ${actorName} at ${sentAt}.`,
      'If you received this, SMTP is configured correctly.',
    ].join('\n'),
    title: 'SMTP test successful',
    preheader: `${BRAND_NAME} SMTP is configured correctly`,
    bodyHtml: [
      emailParagraph(`This is a test message from the <strong>${BRAND_NAME}</strong> Super Admin control panel.`),
      emailMuted(`Sent by ${escapeHtml(actorName)} at ${escapeHtml(sentAt)}.`),
      emailMuted('If you received this, SMTP is configured correctly.'),
    ].join(''),
  })
  return sendMail({ to, ...mail })
}

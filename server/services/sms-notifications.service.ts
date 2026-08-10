import type { Db } from '../db/client'
import { enqueueJob } from './jobs.service'
import { isQuoEnabled } from './quo.service'
import { resolveSmsBody } from './sms-templates.service'
import { resolveEmailBrand } from './email-branding.service'
import { getAppUrl } from './app-config.service'

export async function enqueueSmsSend(
  db: Db,
  input: {
    to: string
    body: string
    meta?: Record<string, unknown>
  },
) {
  return enqueueJob(db, 'sms_send', {
    to: input.to,
    body: input.body,
    ...(input.meta ?? {}),
  })
}

export async function enqueueTemplatedSms(
  db: Db,
  input: {
    to: string
    typeKey: string
    vars: Record<string, string | null | undefined>
    meta?: Record<string, unknown>
  },
) {
  // Refresh before gating — avoids a stale "disabled" cache after Quo is enabled.
  const { refreshQuoConfigCache } = await import('./quo.service')
  await refreshQuoConfigCache(db)
  if (!(await isQuoEnabled(db))) {
    return { queued: false as const, reason: 'quo_disabled' as const }
  }

  const brand = await resolveEmailBrand(db)
  const body = await resolveSmsBody(db, input.typeKey, {
    brandName: brand.brandName || 'DORINC',
    appUrl: brand.appUrl || getAppUrl(),
    ...input.vars,
  })
  if (!body) return { queued: false as const, reason: 'empty_body' as const }

  await enqueueSmsSend(db, {
    to: input.to,
    body,
    meta: {
      notificationKind: input.typeKey,
      ...(input.meta ?? {}),
    },
  })
  return { queued: true as const }
}

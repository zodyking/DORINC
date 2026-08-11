import type { Db } from '../db/client'
import { enqueueJob } from './jobs.service'
import {
  getQuoConfig,
  isQuoSmsEnabled,
  refreshQuoConfigCache,
  sendQuoSms,
} from './quo.service'
import { resolveSmsBody } from './sms-templates.service'
import { resolveEmailBrand } from './email-branding.service'
import { getAppUrl } from './app-config.service'

export async function enqueueSmsSend(
  db: Db,
  input: {
    to: string
    body: string
    meta?: Record<string, unknown>
    runAfter?: Date
  },
) {
  return enqueueJob(db, 'sms_send', {
    to: input.to,
    body: input.body,
    ...(input.meta ?? {}),
  }, 3, {
    runAfter: input.runAfter,
  })
}

/** Resolve a templated SMS body and queue it for later delivery (e.g. Susan intro). */
export async function enqueueTemplatedSmsLater(
  db: Db,
  input: {
    to: string
    typeKey: string
    vars: Record<string, string | null | undefined>
    runAfter: Date
    meta?: Record<string, unknown>
  },
) {
  await refreshQuoConfigCache(db)
  const config = await getQuoConfig(db)
  if (!isQuoSmsEnabled(config)) {
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
    runAfter: input.runAfter,
    meta: {
      notificationKind: input.typeKey,
      ...(input.meta ?? {}),
    },
  })
  return { queued: true as const, mode: 'scheduled' as const }
}

/**
 * Deliver a templated SMS the same way Control Panel "Send test SMS" does:
 * call Quo immediately from Nitro. Only queue a retry job if the direct send fails.
 */
export async function enqueueTemplatedSms(
  db: Db,
  input: {
    to: string
    typeKey: string
    vars: Record<string, string | null | undefined>
    meta?: Record<string, unknown>
  },
) {
  await refreshQuoConfigCache(db)
  const config = await getQuoConfig(db)
  if (!isQuoSmsEnabled(config)) {
    return { queued: false as const, reason: 'quo_disabled' as const }
  }

  const brand = await resolveEmailBrand(db)
  const body = await resolveSmsBody(db, input.typeKey, {
    brandName: brand.brandName || 'DORINC',
    appUrl: brand.appUrl || getAppUrl(),
    ...input.vars,
  })
  if (!body) return { queued: false as const, reason: 'empty_body' as const }

  const meta = {
    notificationKind: input.typeKey,
    ...(input.meta ?? {}),
  }

  try {
    await sendQuoSms({
      apiKey: config.apiKey,
      from: config.fromNumber,
      to: input.to,
      content: body,
    })
    return { queued: true as const, mode: 'direct' as const }
  }
  catch (err) {
    console.warn(
      `[sms] direct Quo send failed for ${input.typeKey}; queueing retry:`,
      err instanceof Error ? err.message : err,
    )
    await enqueueSmsSend(db, {
      to: input.to,
      body,
      meta,
    })
    return { queued: true as const, mode: 'queued' as const }
  }
}

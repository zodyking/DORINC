import type { Db } from '../db/client'
import { enqueueJob } from './jobs.service'
import {
  getQuoConfig,
  isQuoSmsEnabled,
  refreshQuoConfigCache,
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
 * Queue a templated SMS for the worker. Never calls Quo synchronously on the
 * request path — a slow/failing Quo API used to block HTML geofence redirects
 * and auth flows for users with messageNotifyChannel=sms.
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

  await enqueueSmsSend(db, {
    to: input.to,
    body,
    meta,
  })
  return { queued: true as const, mode: 'queued' as const }
}

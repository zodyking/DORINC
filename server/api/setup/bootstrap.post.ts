import { getHeader, getRequestIP } from 'h3'
import { z } from 'zod'
import { login } from '../../auth/auth.service'
import { setSessionCookie } from '../../auth/session-cookie'
import { useDb } from '../../db/client'
import { bootstrapSuperAdmin, BootstrapLockedError } from '../../services/setup.service'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../utils/require-rate-limit'
import { validateBody } from '../../utils/validate'
import { emailSchema, nonEmptyString } from '../../../shared/validators/common'

const bootstrapSchema = z.object({
  name: nonEmptyString.max(120),
  email: emailSchema,
  password: z.string().min(12).max(200),
})

export default defineEventHandler(async (event) => {
  // Tight rate limit on first-run bootstrap — prevents Super Admin squatting (P4-07).
  await requireRateLimit(event, 'login', rateLimitKeyFromIp(event, 'bootstrap'), {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000,
  })

  const body = await validateBody(event, bootstrapSchema)
  const allowedEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase()
  if (allowedEmail && body.email.trim().toLowerCase() !== allowedEmail) {
    throw apiError(event, 'FORBIDDEN', 'Bootstrap email does not match ADMIN_BOOTSTRAP_EMAIL')
  }

  const db = useDb()

  try {
    const user = await bootstrapSuperAdmin(db, body)

    await writeAudit(event, {
      entityType: 'user',
      entityId: user.id,
      action: 'auth.bootstrap_super_admin',
      afterData: { email: user.email, name: user.name },
      actor: { id: user.id, accountType: 'super_admin', name: user.name, email: user.email },
      riskLevel: 'high',
    })

    // Sign the new Super Admin straight in
    const result = await login(db, user.email, body.password, {
      ipAddress: getRequestIP(event, { xForwardedFor: true }),
      userAgent: getHeader(event, 'user-agent'),
    })
    setSessionCookie(event, result.sessionToken)

    return {
      status: 'bootstrapped',
      user: { id: user.id, name: user.name, email: user.email, accountType: 'super_admin' },
    }
  }
  catch (err) {
    if (err instanceof BootstrapLockedError) {
      throw apiError(event, 'CONFLICT', 'Setup is locked — a Super Admin already exists')
    }
    throw err
  }
})

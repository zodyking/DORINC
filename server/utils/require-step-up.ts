import type { H3Event } from 'h3'
import { isStepUpValid } from '../services/step-up.service'
import { apiError } from './api-error'

export interface AuthContextWithStepUp {
  sessionId?: string
  stepUpVerifiedAt?: Date | null
}

/**
 * Require a recent step-up verification on the current session (SPEC §4, §13).
 * Returns 403 with reason step_up_required when password re-verification is needed.
 */
export function requireStepUp(event: H3Event): void {
  const auth = event.context.auth as AuthContextWithStepUp | undefined
  if (!auth?.sessionId) {
    throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')
  }

  if (!isStepUpValid(auth.stepUpVerifiedAt)) {
    throw apiError(event, 'FORBIDDEN', 'Step-up verification required', { reason: 'step_up_required' })
  }
}

/** Require Super Admin account type in addition to system.admin.all permission. */
export function requireSuperAdmin(event: H3Event, user: { accountType: string }): void {
  if (user.accountType !== 'super_admin') {
    throw apiError(event, 'FORBIDDEN', 'Super Admin access required', { reason: 'super_admin_required' })
  }
}

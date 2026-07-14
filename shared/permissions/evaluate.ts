import type { AccountType, PermissionKey } from './keys'
import { ACCOUNT_TYPE_BUNDLES } from './keys'

export interface PermissionUser {
  id: string
  accountType: AccountType | string
  isActive: boolean
  emailVerifiedAt: string | Date | null
  approvedAt: string | Date | null
}

export interface PermissionOverrides {
  allow: PermissionKey[]
  deny: PermissionKey[]
}

export interface PermissionCheckInput {
  user: PermissionUser
  overrides?: PermissionOverrides
  required: PermissionKey
  /**
   * DB-driven role grants. When provided, used instead of ACCOUNT_TYPE_BUNDLES.
   * Omit in unit tests to fall back to the hardcoded bundles.
   */
  roleGrants?: PermissionKey[]
  /**
   * For `.own`-scoped keys: does the target record belong to the user?
   * Omit when the route has no specific record (e.g. create/list own).
   */
  ownsRecord?: boolean
}

export type PermissionDecision
  = | { allowed: true }
    | { allowed: false, reason: 'inactive' | 'unverified' | 'unapproved' | 'not_granted' | 'denied' | 'scope' }

/**
 * Permission evaluation order (SPEC §4):
 * 1. active → 2. internal verified+approved → 3. bundle → 4. overrides →
 * 5. deny wins → 6. record scope.
 */
export function evaluatePermission(input: PermissionCheckInput): PermissionDecision {
  const { user, required, overrides, ownsRecord, roleGrants } = input

  if (!user.isActive) return { allowed: false, reason: 'inactive' }

  const isInternal = user.accountType !== 'customer'
  if (isInternal) {
    if (!user.emailVerifiedAt) return { allowed: false, reason: 'unverified' }
    if (!user.approvedAt) return { allowed: false, reason: 'unapproved' }
  }

  // Deny wins over any allow, bundle or override.
  if (overrides?.deny.includes(required)) return { allowed: false, reason: 'denied' }

  // Use DB-driven roleGrants if provided, otherwise fall back to hardcoded bundles
  const bundle = roleGrants ?? ACCOUNT_TYPE_BUNDLES[user.accountType as AccountType] ?? []
  const granted = bundle.includes(required) || overrides?.allow.includes(required) === true
  if (!granted) return { allowed: false, reason: 'not_granted' }

  // Record scope: `.own` keys require ownership when a record is targeted.
  if (required.endsWith('.own') && ownsRecord === false) {
    return { allowed: false, reason: 'scope' }
  }

  return { allowed: true }
}

import { getDashboard } from '../../services/dashboard.service'
import { useDb } from '../../db/client'
import type { AuthContext } from '../../utils/require-permission'
import type { AccountType, PermissionKey } from '../../../shared/permissions/keys'
import { ALL_PERMISSION_KEYS } from '../../../shared/permissions/keys'
import { evaluatePermission } from '../../../shared/permissions/evaluate'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as (AuthContext & { user: { name: string, email: string } }) | undefined
  if (!auth?.user) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  const permissions = ALL_PERMISSION_KEYS.filter((key) =>
    evaluatePermission({
      user: auth.user,
      overrides: auth.overrides,
      required: key,
    }).allowed,
  ) as PermissionKey[]

  return getDashboard(useDb(), {
    id: auth.user.id,
    name: auth.user.name ?? 'User',
    accountType: auth.user.accountType as AccountType,
  }, permissions)
})

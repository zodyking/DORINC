import type { AuthContext } from '../../utils/require-permission'
import { apiError } from '../../utils/api-error'
import { ACCOUNT_TYPE_BUNDLES } from '../../../shared/permissions/keys'

export default defineEventHandler((event) => {
  const auth = event.context.auth as (AuthContext & { user: { name: string, email: string, customerId: string | null } }) | undefined
  if (!auth?.user) {
    throw apiError(event, 'UNAUTHENTICATED', 'Not signed in')
  }

  const bundle = ACCOUNT_TYPE_BUNDLES[auth.user.accountType] ?? []
  const effective = new Set([...bundle, ...auth.overrides.allow])
  for (const denied of auth.overrides.deny) effective.delete(denied)

  return {
    user: {
      id: auth.user.id,
      name: auth.user.name,
      email: auth.user.email,
      accountType: auth.user.accountType,
      customerId: auth.user.customerId,
    },
    permissions: [...effective].sort(),
  }
})

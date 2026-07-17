import type { AuthContext } from '../../utils/require-permission'
import { apiError } from '../../utils/api-error'

export default defineEventHandler((event) => {
  const auth = event.context.auth as (AuthContext & {
    user: { name: string, email: string, username: string | null, customerId: string | null }
  }) | undefined
  if (!auth?.user) {
    throw apiError(event, 'UNAUTHENTICATED', 'Not signed in')
  }

  // Use DB-driven roleGrants + user overrides
  const effective = new Set([...auth.roleGrants, ...auth.overrides.allow])
  for (const denied of auth.overrides.deny) effective.delete(denied)

  return {
    user: {
      id: auth.user.id,
      name: auth.user.name,
      email: auth.user.email,
      username: auth.user.username,
      accountType: auth.user.accountType,
      customerId: auth.user.customerId,
      nonCustomerEmailEnabled: (auth.user as { nonCustomerEmailEnabled?: boolean }).nonCustomerEmailEnabled === true,
    },
    permissions: [...effective].sort(),
  }
})

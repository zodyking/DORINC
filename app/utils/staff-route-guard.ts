/** Shared staff-route guard — used by middleware and staff layout. */
export async function guardStaffRoute(): Promise<void> {
  const auth = useAuthStore()
  if (!auth.loaded) await auth.fetchMe()

  if (!auth.isSignedIn) {
    return navigateTo('/auth/login?card=staff')
  }

  if (auth.isCustomer) {
    return navigateTo('/portal')
  }
}

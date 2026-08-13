export const ADMIN_USERS_LIST_KEY = 'admin-users-list'

export function adminUserDetailKey(id: string) {
  return `admin-users-detail:${id}`
}

export function adminUserPermissionsKey(id: string) {
  return `admin-users-permissions:${id}`
}

/** Drop Nuxt payload/data cache for admin user list + detail after mutations. */
export function bustAdminUsersCache() {
  clearNuxtData(key => typeof key === 'string' && key.startsWith('admin-users'))
}

import { defineStore } from 'pinia'
import { runSessionSaveHandlers } from '~/composables/useSessionLogoutHandlers'
import { loginPathForRoute, redirectToLogin } from '~/utils/auth-session'
import type { StaffLoginGeo } from '#shared/validators/auth'

export interface AuthUser {
  id: string
  name: string
  email: string
  username?: string | null
  accountType: string
  customerId?: string | null
  mustChangePassword?: boolean
  nonCustomerEmailEnabled?: boolean
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AuthUser | null,
    permissions: [] as string[],
    loaded: false,
    sessionExpiring: false,
  }),

  getters: {
    isSignedIn: state => !!state.user,
    isCustomer: state => state.user?.accountType === 'customer',
    can: state => (key: string) => state.permissions.includes(key),
  },

  actions: {
    loginPath(): string {
      if (import.meta.client) {
        return loginPathForRoute(window.location.pathname)
      }
      if (this.isCustomer) return '/auth/login'
      return '/auth/login?card=staff'
    },

    async fetchMe() {
      // On SSR, plain $fetch does not forward the incoming request's cookies
      const fetcher = import.meta.server ? useRequestFetch() : $fetch
      try {
        const res = await fetcher<{ user: AuthUser, permissions: string[] }>('/api/auth/me')
        this.user = res.user
        this.permissions = res.permissions
        return true
      }
      catch {
        this.user = null
        this.permissions = []
        return false
      }
      finally {
        this.loaded = true
      }
    },

    async login(identifier: string, password: string, portal: 'customer' | 'staff', geo?: StaffLoginGeo) {
      const body = portal === 'customer'
        ? { username: identifier, password, portal }
        : { email: identifier, password, portal, geo }
      let res: { user: AuthUser }
      try {
        res = await $fetch<{ user: AuthUser }>('/api/auth/login', {
          method: 'POST',
          body,
        })
      }
      catch (err: unknown) {
        // Access gate: blocked location/IP → redirect to the admin-set link.
        const details = (err as { data?: { details?: Record<string, unknown>, data?: { details?: Record<string, unknown> } } })?.data
        const d = details?.details ?? details?.data?.details
        if (d?.reason === 'access_blocked') {
          const redirectUrl = typeof d.redirectUrl === 'string' ? d.redirectUrl : ''
          if (import.meta.client && redirectUrl) {
            window.location.href = redirectUrl
          }
        }
        throw err
      }
      this.user = res.user
      this.loaded = true
      try {
        const fetcher = import.meta.server ? useRequestFetch() : $fetch
        const me = await fetcher<{ user: AuthUser, permissions: string[] }>('/api/auth/me')
        this.user = me.user
        this.permissions = me.permissions
      }
      catch {
        // Cookie is set — keep the login response even if /me hiccups on first request.
        this.permissions = []
      }
      return res.user
    },

    async releaseEditingSessions() {
      try {
        await $fetch('/api/editing-sessions/release-mine', { method: 'POST' })
      }
      catch {
        // Best-effort before sign-out.
      }
    },

    async forceLogout(redirect = true) {
      try {
        await $fetch('/api/auth/logout', { method: 'POST' })
      }
      catch {
        // Session may already be revoked (account revoke, server timeout, etc.).
      }
      this.user = null
      this.permissions = []
      this.loaded = true
      if (redirect) {
        const path = import.meta.client ? window.location.pathname : this.loginPath()
        await redirectToLogin(path)
      }
    },

    async handleSessionExpired() {
      if (!this.user || this.sessionExpiring) return
      this.sessionExpiring = true
      try {
        await runSessionSaveHandlers()
        await this.releaseEditingSessions()
        await this.forceLogout(true)
      }
      finally {
        this.sessionExpiring = false
      }
    },

    async logout() {
      await this.releaseEditingSessions()
      await this.forceLogout(true)
    },
  },
})

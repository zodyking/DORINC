import { defineStore } from 'pinia'
import { runSessionSaveHandlers } from '~/composables/useSessionLogoutHandlers'
import { loginPathForRoute, redirectToLogin } from '~/utils/auth-session'
import { clearPwaBannerDismissed } from '~/utils/pwa-install-state'
import type { StaffLoginGeo } from '#shared/validators/auth'

export interface AuthUser {
  id: string
  name: string
  email: string
  username?: string | null
  accountType: string
  customerId?: string | null
  mustChangePassword?: boolean
}

export interface TrainingGateState {
  locked: boolean
  assignmentId: string | null
  moduleId: string | null
  moduleSlug: string | null
  moduleTitle: string | null
}

export interface AnnouncementGateState {
  locked: boolean
  pendingCount: number
  currentId: string | null
}

export type StaffLoginPending = { needsLocation: true, loginToken: string }
export type StaffLoginResult = AuthUser | StaffLoginPending

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AuthUser | null,
    permissions: [] as string[],
    trainingGate: null as TrainingGateState | null,
    announcementGate: null as AnnouncementGateState | null,
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

    applyMePayload(me: {
      user: AuthUser
      permissions: string[]
      trainingGate?: TrainingGateState | null
      announcementGate?: AnnouncementGateState | null
    }) {
      this.user = me.user
      this.permissions = me.permissions
      this.trainingGate = me.trainingGate ?? null
      this.announcementGate = me.announcementGate ?? null
    },

    async fetchMe() {
      // On SSR, plain $fetch does not forward the incoming request's cookies
      const fetcher = import.meta.server ? useRequestFetch() : $fetch
      try {
        const res = await fetcher<{
          user: AuthUser
          permissions: string[]
          trainingGate?: TrainingGateState
          announcementGate?: AnnouncementGateState
        }>('/api/auth/me')
        this.applyMePayload(res)
        return true
      }
      catch {
        this.user = null
        this.permissions = []
        this.trainingGate = null
        this.announcementGate = null
        return false
      }
      finally {
        this.loaded = true
      }
    },

    async login(identifier: string, password: string, portal: 'customer' | 'staff'): Promise<StaffLoginResult> {
      const body = portal === 'customer'
        ? { username: identifier, password, portal }
        : { email: identifier, password, portal }
      let res: { user?: AuthUser, needsLocation?: boolean, loginToken?: string }
      try {
        res = await $fetch<{ user?: AuthUser, needsLocation?: boolean, loginToken?: string }>('/api/auth/login', {
          method: 'POST',
          body,
        })
      }
      catch (err: unknown) {
        // Access gate: blocked location/IP → internal verify or restricted page only.
        const details = (err as { data?: { details?: Record<string, unknown>, data?: { details?: Record<string, unknown> } } })?.data
        const d = details?.details ?? details?.data?.details
        if (d?.reason === 'access_blocked') {
          const redirectTo = typeof d.redirectTo === 'string' && d.redirectTo.startsWith('/')
            ? d.redirectTo
            : '/auth/access-restricted'
          if (import.meta.client) {
            await navigateTo(redirectTo)
          }
        }
        throw err
      }
      if (res?.needsLocation === true && typeof res.loginToken === 'string' && res.loginToken) {
        return { needsLocation: true as const, loginToken: res.loginToken }
      }
      if (!res.user) throw new Error('Login response missing user')
      this.user = res.user
      this.loaded = true
      try {
        const fetcher = import.meta.server ? useRequestFetch() : $fetch
        const me = await fetcher<{
          user: AuthUser
          permissions: string[]
          trainingGate?: TrainingGateState
          announcementGate?: AnnouncementGateState
        }>('/api/auth/me')
        this.applyMePayload(me)
      }
      catch {
        // Cookie is set — keep the login response even if /me hiccups on first request.
        this.permissions = []
      }
      return res.user
    },

    async completeStaffLogin(loginToken: string, geo: StaffLoginGeo) {
      let res: { user: AuthUser }
      try {
        res = await $fetch<{ user: AuthUser }>('/api/auth/complete-login', {
          method: 'POST',
          body: { loginToken, geo },
        })
      }
      catch (err: unknown) {
        const details = (err as { data?: { details?: Record<string, unknown>, data?: { details?: Record<string, unknown> } } })?.data
        const d = details?.details ?? details?.data?.details
        if (d?.reason === 'access_blocked') {
          const redirectTo = typeof d.redirectTo === 'string' && d.redirectTo.startsWith('/')
            ? d.redirectTo
            : '/auth/access-restricted'
          if (import.meta.client) {
            await navigateTo(redirectTo)
          }
        }
        throw err
      }
      this.user = res.user
      this.loaded = true
      try {
        const fetcher = import.meta.server ? useRequestFetch() : $fetch
        const me = await fetcher<{
          user: AuthUser
          permissions: string[]
          trainingGate?: TrainingGateState
          announcementGate?: AnnouncementGateState
        }>('/api/auth/me')
        this.applyMePayload(me)
      }
      catch {
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
      this.trainingGate = null
      this.announcementGate = null
      this.loaded = true
      if (import.meta.client) clearPwaBannerDismissed()
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

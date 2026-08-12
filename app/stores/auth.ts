import { defineStore } from 'pinia'
import { runSessionSaveHandlers } from '~/composables/useSessionLogoutHandlers'
import {
  loginPathForRoute,
  redirectToLogin,
  redirectToSessionTerminated,
  isMassSessionTerminationActive,
  shouldClearSessionOnFetchMeError,
} from '~/utils/auth-session'
import { clearOutsideGeoTabSession, markOutsideGeoTabSession } from '~/utils/outside-geo-session'
import { clearPwaBannerDismissed } from '~/utils/pwa-install-state'
import type { StaffLoginGeo } from '#shared/validators/auth'
import { AUTH_ME_FOCUS_MIN_GAP_MS } from '#shared/auth-me-refresh'

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

export type FetchMeOptions = {
  /** Bypass min-gap throttle (login, logout recovery, explicit gate refresh). */
  force?: boolean
  /** Skip if a successful /me finished within this many ms (default: no skip). */
  minGapMs?: number
}

/** Dedup concurrent /api/auth/me calls across middleware, plugins, and login. */
let fetchMeInflight: Promise<boolean> | null = null
let lastFetchMeAt = 0

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AuthUser | null,
    permissions: [] as string[],
    trainingGate: null as TrainingGateState | null,
    announcementGate: null as AnnouncementGateState | null,
    loaded: false,
    sessionExpiring: false,
    /** True while login/complete-login is hydrating /me — skip session-guard logout races. */
    loginHydrating: false,
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

    async fetchMe(opts: FetchMeOptions = {}) {
      const minGapMs = opts.force ? 0 : (opts.minGapMs ?? 0)
      if (minGapMs > 0 && lastFetchMeAt > 0 && Date.now() - lastFetchMeAt < minGapMs) {
        return !!this.user
      }

      // Collapse concurrent callers (middleware + plugins + login) into one request.
      if (fetchMeInflight) return fetchMeInflight

      fetchMeInflight = (async () => {
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
          lastFetchMeAt = Date.now()
          return true
        }
        catch (err: unknown) {
          // Only a real unauthenticated response may wipe the client session.
          // 5xx/network during post-login /me used to clear `user` and bounce
          // middleware back to the login screen (brief error flash).
          if (shouldClearSessionOnFetchMeError(err)) {
            this.user = null
            this.permissions = []
            this.trainingGate = null
            this.announcementGate = null
            lastFetchMeAt = Date.now()
            return false
          }
          lastFetchMeAt = Date.now()
          return !!this.user
        }
        finally {
          this.loaded = true
        }
      })().finally(() => {
        fetchMeInflight = null
      })

      return fetchMeInflight
    },

    /** Focus / visibility refresh — sooner than the 5s poll, but throttled. */
    async fetchMeSoon() {
      return this.fetchMe({ minGapMs: AUTH_ME_FOCUS_MIN_GAP_MS })
    },

    async login(identifier: string, password: string, portal: 'customer' | 'staff'): Promise<StaffLoginResult> {
      const body = portal === 'customer'
        ? { username: identifier, password, portal }
        : { email: identifier, password, portal }
      let res: {
        user?: AuthUser
        needsLocation?: boolean
        loginToken?: string
        armOutsideGeoTabSession?: boolean
      }
      try {
        res = await $fetch<{
          user?: AuthUser
          needsLocation?: boolean
          loginToken?: string
          armOutsideGeoTabSession?: boolean
        }>('/api/auth/login', {
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
      if (res.armOutsideGeoTabSession) markOutsideGeoTabSession()
      this.loginHydrating = true
      try {
        this.user = res.user
        this.loaded = true
        // Shared fetchMe dedupes with session-guard / middleware (avoids parallel /me races).
        const ok = await this.fetchMe({ force: true })
        if (!ok && !this.user) {
          // Cookie/session rejected immediately — surface as login failure.
          throw new Error('Sign-in did not complete — please try again')
        }
      }
      finally {
        this.loginHydrating = false
      }
      return res.user
    },

    async completeStaffLogin(loginToken: string, geo: StaffLoginGeo) {
      let res: { user: AuthUser, armOutsideGeoTabSession?: boolean }
      try {
        res = await $fetch<{ user: AuthUser, armOutsideGeoTabSession?: boolean }>('/api/auth/complete-login', {
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
      // GPS login validated this browser tab — required for data APIs outside the fence.
      if (res.armOutsideGeoTabSession !== false) markOutsideGeoTabSession()
      this.loginHydrating = true
      try {
        this.user = res.user
        this.loaded = true
        const ok = await this.fetchMe({ force: true })
        if (!ok && !this.user) {
          throw new Error('Sign-in did not complete — please try again')
        }
      }
      finally {
        this.loginHydrating = false
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

    async forceLogout(redirect = true, opts: { reason?: 'terminated' | 'default' } = {}) {
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
      if (import.meta.client) {
        clearPwaBannerDismissed()
        clearOutsideGeoTabSession()
      }
      if (redirect) {
        if (opts.reason === 'terminated') {
          await redirectToSessionTerminated()
          return
        }
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
        const terminated = await isMassSessionTerminationActive()
        await this.forceLogout(true, { reason: terminated ? 'terminated' : 'default' })
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

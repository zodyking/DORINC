import { defineStore } from 'pinia'

export interface AuthUser {
  id: string
  name: string
  email: string
  accountType: string
  customerId?: string | null
  mustChangePassword?: boolean
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AuthUser | null,
    permissions: [] as string[],
    loaded: false,
  }),

  getters: {
    isSignedIn: state => !!state.user,
    isCustomer: state => state.user?.accountType === 'customer',
    can: state => (key: string) => state.permissions.includes(key),
  },

  actions: {
    async fetchMe() {
      // On SSR, plain $fetch does not forward the incoming request's cookies
      const fetcher = import.meta.server ? useRequestFetch() : $fetch
      try {
        const res = await fetcher<{ user: AuthUser, permissions: string[] }>('/api/auth/me')
        this.user = res.user
        this.permissions = res.permissions
      }
      catch {
        this.user = null
        this.permissions = []
      }
      this.loaded = true
    },

    async login(email: string, password: string) {
      const res = await $fetch<{ user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      this.user = res.user
      await this.fetchMe()
      return res.user
    },

    async logout() {
      await $fetch('/api/auth/logout', { method: 'POST' })
      this.user = null
      this.permissions = []
      await navigateTo('/auth/login')
    },
  },
})

import type { UseFetchOptions } from 'nuxt/app'

type ClientFetchUrl = string | (() => string | null)

/**
 * Client-side useFetch defaults that avoid Nuxt Suspense blank pages after navigation.
 * See app/pages/invoices/index.vue — do not top-level await useFetch on staff/portal pages.
 */
export function useClientFetch<T>(
  url: ClientFetchUrl,
  opts: Omit<UseFetchOptions<T>, 'server' | 'lazy'> & { lazy?: boolean } = {},
) {
  return useFetch<T>(url, {
    server: false,
    lazy: true,
    ...opts,
  })
}

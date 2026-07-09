import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearOfflineQueue,
  enqueueOfflineAction,
  offlineQueueCount,
} from '../../app/composables/useOfflineQueue'

describe('PWA offline queue stub (P4-01)', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    })
    clearOfflineQueue()
  })

  it('queues actions in localStorage stub', () => {
    expect(offlineQueueCount()).toBe(0)
    enqueueOfflineAction({ method: 'POST', url: '/api/service-logs', body: { note: 'offline draft' } })
    expect(offlineQueueCount()).toBe(1)
  })

  it('clears the queue', () => {
    enqueueOfflineAction({ method: 'PATCH', url: '/api/invoices/1' })
    clearOfflineQueue()
    expect(offlineQueueCount()).toBe(0)
  })
})

describe('PWA manifest (P4-01)', () => {
  it('declares required install fields', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const raw = readFileSync(join(process.cwd(), 'public/manifest.webmanifest'), 'utf8')
    const manifest = JSON.parse(raw) as {
      name: string
      short_name: string
      start_url: string
      display: string
      icons: Array<{ sizes: string }>
    }
    expect(manifest.name).toBe('DORINC')
    expect(manifest.short_name).toBe('DORINC')
    expect(manifest.start_url).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.some(i => i.sizes === '192x192')).toBe(true)
    expect(manifest.icons.some(i => i.sizes === '512x512')).toBe(true)
  })
})

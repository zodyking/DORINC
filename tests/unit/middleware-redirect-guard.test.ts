import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearMiddlewareRedirectLog,
  noteMiddlewareRedirect,
} from '../../app/utils/middleware-redirect-guard'

describe('middleware redirect guard', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
      removeItem: (key: string) => { store.delete(key) },
    })
    clearMiddlewareRedirectLog()
  })

  it('flags a redirect storm', () => {
    let tripped = false
    for (let i = 0; i < 10; i++) {
      tripped = noteMiddlewareRedirect(i % 2 === 0 ? '/dashboard' : '/account')
    }
    expect(tripped).toBe(true)
  })

  it('does not flag a handful of redirects', () => {
    expect(noteMiddlewareRedirect('/dashboard')).toBe(false)
    expect(noteMiddlewareRedirect('/announcements/required')).toBe(false)
    expect(noteMiddlewareRedirect('/account')).toBe(false)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearGateCooldown,
  isGateCooldownActive,
  startGateCooldown,
} from '../../app/utils/staff-gate-cooldown'
import { noteMiddlewareRedirect } from '../../app/utils/middleware-redirect-guard'

describe('staff gate cooldown', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
      removeItem: (key: string) => { store.delete(key) },
    })
    clearGateCooldown()
  })

  it('suppresses gates for the cooldown window, then re-arms', () => {
    expect(isGateCooldownActive()).toBe(false)
    startGateCooldown(50)
    expect(isGateCooldownActive()).toBe(true)
    clearGateCooldown()
    expect(isGateCooldownActive()).toBe(false)
  })

  it('expires on its own', async () => {
    startGateCooldown(10)
    expect(isGateCooldownActive()).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 25))
    expect(isGateCooldownActive()).toBe(false)
  })

  it('still works when sessionStorage writes fail', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    })
    clearGateCooldown()
    startGateCooldown(1000)
    expect(isGateCooldownActive()).toBe(true)
    clearGateCooldown()
    expect(isGateCooldownActive()).toBe(false)
  })
})

describe('middleware redirect guard memory fallback', () => {
  it('trips the breaker even when sessionStorage is blocked', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    })
    let tripped = false
    for (let i = 0; i < 10; i++) {
      tripped = noteMiddlewareRedirect('/dashboard')
    }
    expect(tripped).toBe(true)
  })
})

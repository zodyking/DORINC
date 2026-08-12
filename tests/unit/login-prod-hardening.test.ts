import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('silent developer mode boot repair', () => {
  it('ensures the column on every boot after drizzle migrate', () => {
    const migrate = readFileSync(resolve('server/db/migrate-runtime.ts'), 'utf8')
    expect(migrate).toContain('ensureSilentDeveloperModeSchema')
  })

  it('adds the column idempotently when missing', () => {
    const src = readFileSync(resolve('server/lib/ensure-silent-developer-mode-schema.mjs'), 'utf8')
    expect(src).toContain('silent_developer_mode')
    expect(src).toContain('ADD COLUMN IF NOT EXISTS')
  })

  it('reports schema status on deep health probes', () => {
    const health = readFileSync(resolve('server/api/health.get.ts'), 'utf8')
    expect(health).toContain('usersSilentDeveloperMode')
  })
})

describe('client cache bust after login fixes', () => {
  it('bumps the service worker version so PWA clients pick up new fetch/beacon code', () => {
    const src = readFileSync(resolve('app/plugins/pwa.client.ts'), 'utf8')
    expect(src).toContain("const SW_VERSION = 'v6'")
  })
})

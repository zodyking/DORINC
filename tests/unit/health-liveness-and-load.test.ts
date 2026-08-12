import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('health endpoint is a liveness probe', () => {
  const src = readFileSync(resolve('server/api/health.get.ts'), 'utf8')

  it('never returns 503 so the proxy cannot drop the app for every session', () => {
    expect(src).not.toContain('503')
    expect(src).toContain('setResponseStatus(event, 200)')
  })

  it('skips database work unless a deep probe is requested', () => {
    expect(src).toContain('deep')
    expect(src).toMatch(/if \(!deep\)/)
  })

  it('reports critical schema columns on deep probes', () => {
    expect(src).toContain('usersSilentDeveloperMode')
  })
})

describe('load protections against pool starvation', () => {
  it('throttles session activity writes', () => {
    const src = readFileSync(resolve('server/auth/auth.service.ts'), 'utf8')
    expect(src).toContain('SESSION_ACTIVITY_WRITE_MIN_GAP_MS')
  })

  it('raises the database pool ceiling and traps idle client errors', () => {
    const src = readFileSync(resolve('server/db/client.ts'), 'utf8')
    expect(src).toContain('DATABASE_POOL_MAX')
    expect(src).toContain("_pool.on('error'")
  })

  it('polls /api/auth/me far less aggressively than every 5s', () => {
    const src = readFileSync(resolve('shared/auth-me-refresh.ts'), 'utf8')
    expect(src).toContain('AUTH_ME_POLL_MS = 30_000')
  })

  it('throttles the visit beacon per path', () => {
    const src = readFileSync(resolve('app/plugins/02.security-visit.client.ts'), 'utf8')
    expect(src).toContain('BEACON_MIN_GAP_MS')
    expect(src).toContain('recentlyBeaconed')
  })

  it('keeps unhandled rejections from killing the process', () => {
    const src = readFileSync(resolve('server/plugins/process-safety.ts'), 'utf8')
    expect(src).toContain('unhandledRejection')
    expect(src).toContain('uncaughtException')
  })
})

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function runtimePath() {
  return join(process.cwd(), '.data', 'runtime.json')
}

function buildDatabaseUrl(config) {
  const user = encodeURIComponent(config.username)
  const pass = encodeURIComponent(config.password)
  const database = encodeURIComponent(config.database)
  return `postgresql://${user}:${pass}@${config.host.trim()}:${Number(config.port || 5432)}/${database}`
}

/** Env override for CI; otherwise `.data/runtime.json` from setup wizard. */
export function getDatabaseUrl() {
  const env = process.env.DATABASE_URL?.trim()
  if (env) return env

  const path = runtimePath()
  if (!existsSync(path)) return null

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    if (!parsed?.database) return null
    return buildDatabaseUrl(parsed.database)
  }
  catch {
    return null
  }
}

export function requireDatabaseUrl() {
  const url = getDatabaseUrl()
  if (!url) {
    console.error('[runtime-config] Database not configured — complete /setup first')
    process.exit(1)
  }
  return url
}

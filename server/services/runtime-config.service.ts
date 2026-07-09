import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface RuntimeDatabaseConfig {
  host: string
  port: number
  database: string
  username: string
  password: string
}

interface RuntimeConfigFile {
  version: 1
  database: RuntimeDatabaseConfig
}

const RUNTIME_DIR = join(process.cwd(), '.data')
const RUNTIME_PATH = join(RUNTIME_DIR, 'runtime.json')

function encodePgComponent(value: string): string {
  return encodeURIComponent(value)
}

export function buildDatabaseUrl(config: RuntimeDatabaseConfig): string {
  const user = encodePgComponent(config.username)
  const pass = encodePgComponent(config.password)
  const host = config.host.trim()
  const port = Number(config.port || 5432)
  const database = encodePgComponent(config.database.trim())
  return `postgresql://${user}:${pass}@${host}:${port}/${database}`
}

/** Env var overrides runtime file (CI/tests only). */
export function getDatabaseUrl(): string | null {
  const env = process.env.DATABASE_URL?.trim()
  if (env) return env

  const cached = readRuntimeConfigSync()
  if (!cached?.database) return null
  return buildDatabaseUrl(cached.database)
}

let _cachedFile: RuntimeConfigFile | null | undefined

function readRuntimeConfigSync(): RuntimeConfigFile | null {
  if (_cachedFile !== undefined) return _cachedFile
  try {
    const raw = readFileSync(RUNTIME_PATH, 'utf8')
    _cachedFile = JSON.parse(raw) as RuntimeConfigFile
    return _cachedFile
  }
  catch {
    _cachedFile = null
    return null
  }
}

export async function readRuntimeConfig(): Promise<RuntimeConfigFile | null> {
  try {
    const raw = await readFile(RUNTIME_PATH, 'utf8')
    const parsed = JSON.parse(raw) as RuntimeConfigFile
    _cachedFile = parsed
    return parsed
  }
  catch {
    _cachedFile = null
    return null
  }
}

export function hasDatabaseConfig(): boolean {
  return getDatabaseUrl() != null
}

export function clearRuntimeConfigCache(): void {
  _cachedFile = undefined
}

export async function saveRuntimeDatabaseConfig(config: RuntimeDatabaseConfig): Promise<void> {
  await mkdir(RUNTIME_DIR, { recursive: true })
  const payload: RuntimeConfigFile = {
    version: 1,
    database: {
      host: config.host.trim(),
      port: Number(config.port || 5432),
      database: config.database.trim(),
      username: config.username.trim(),
      password: config.password,
    },
  }
  await writeFile(RUNTIME_PATH, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  clearRuntimeConfigCache()
}

export function getRuntimeConfigPath(): string {
  return RUNTIME_PATH
}

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'drizzle-kit'
import 'dotenv/config'

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim()
  const path = join(process.cwd(), '.data', 'runtime.json')
  if (!existsSync(path)) {
    throw new Error('No database config — complete /setup or set DATABASE_URL for CLI tools')
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
    database?: { host: string, port: number, database: string, username: string, password: string }
  }
  if (!parsed.database) throw new Error('runtime.json missing database config')
  const d = parsed.database
  const user = encodeURIComponent(d.username)
  const pass = encodeURIComponent(d.password)
  const db = encodeURIComponent(d.database)
  return `postgresql://${user}:${pass}@${d.host}:${d.port}/${db}`
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema/index.ts',
  out: './server/db/migrations',
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
  verbose: true,
  strict: true,
})

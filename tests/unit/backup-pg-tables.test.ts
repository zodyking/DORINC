import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  REQUIRED_BACKUP_TABLES,
  diffRequiredBackupTables,
  tablesFromPgRestoreList,
} from '../../server/lib/backup-pg.mjs'

function schemaTableNames(): string[] {
  const dir = join(process.cwd(), 'server/db/schema')
  const files = readdirSync(dir).filter(name => name.endsWith('.ts'))
  const names = new Set<string>()
  for (const file of files) {
    const src = readFileSync(join(dir, file), 'utf8')
    for (const match of src.matchAll(/pgTable\(\s*['"]([a-zA-Z0-9_]+)['"]/g)) {
      if (match[1]) names.add(match[1])
    }
  }
  return [...names].sort()
}

describe('backup-pg table catalog', () => {
  it('includes every drizzle pgTable from server/db/schema', () => {
    const schemaTables = schemaTableNames()
    expect(schemaTables.length).toBeGreaterThan(40)
    const missing = schemaTables.filter(name => !REQUIRED_BACKUP_TABLES.includes(name))
    expect(missing).toEqual([])
  })

  it('parses TABLE and TABLE DATA entries from pg_restore --list', () => {
    const toc = `
;
; Archive created at 2026-08-06
;
1234; 1259 16384 TABLE public users postgres
1235; 0 0 TABLE DATA public users postgres
1236; 1259 16390 TABLE public billing_integrations postgres
1237; 0 0 COMMENT public TABLE users postgres
`
    expect(tablesFromPgRestoreList(toc)).toEqual(['billing_integrations', 'users'])
  })

  it('reports missing required tables', () => {
    const toc = '1; 1259 1 TABLE public users postgres\n'
    const { missing } = diffRequiredBackupTables(toc, ['users', 'invoices', 'backup_runs'])
    expect(missing).toEqual(['invoices', 'backup_runs'])
  })
})

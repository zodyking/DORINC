#!/usr/bin/env node
// P4-04 — load smoke runner: MAX_UPLOAD_MB boundary + concurrent pdf-worker jobs.
// Usage: node scripts/load-smoke.mjs
// Env: DATABASE_URL (required), MAX_UPLOAD_MB (optional), LOAD_SMOKE_PDF_JOBS (default 5)
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function readEnvValue(key) {
  try {
    const text = readFileSync(join(root, '.env'), 'utf8').replace(/^\uFEFF/, '')
    const match = text.match(new RegExp(`^${key}=(.+)$`, 'm'))
    return match?.[1]?.trim() ?? process.env[key]
  }
  catch {
    return process.env[key]
  }
}

const databaseUrl = readEnvValue('DATABASE_URL')
if (!databaseUrl) {
  console.error('[load-smoke] DATABASE_URL is required (.env or environment)')
  process.exit(1)
}

const maxUploadMb = readEnvValue('MAX_UPLOAD_MB') ?? '25'
const pdfJobs = readEnvValue('LOAD_SMOKE_PDF_JOBS') ?? '5'

console.log(`[load-smoke] MAX_UPLOAD_MB=${maxUploadMb} PDF_JOBS=${pdfJobs}`)
console.log('[load-smoke] Running vitest integration suite…')

const result = spawnSync(
  'npx',
  ['vitest', 'run', 'tests/integration/load-smoke.test.ts', '--reporter=verbose'],
  {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: databaseUrl, MAX_UPLOAD_MB: maxUploadMb, LOAD_SMOKE_PDF_JOBS: pdfJobs },
  },
)

if (result.status === 0) {
  console.log('[load-smoke] PASS — upload boundary + pdf-worker concurrency')
}
else {
  console.error('[load-smoke] FAIL — see output above')
  process.exit(result.status ?? 1)
}

// Dev helper: run an arbitrary SQL query against DATABASE_URL. Usage: node scripts/db-query.mjs "select 1"
import pg from 'pg'
import { readFileSync } from 'node:fs'

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8').replace(/^\uFEFF/, '')
const url = envText.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim()
const u = new URL(url)
const client = new pg.Client({
  host: u.hostname,
  port: Number(u.port || 5432),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.slice(1),
})
await client.connect()
try {
  const res = await client.query(process.argv[2])
  console.log(JSON.stringify(res.rows, null, 2))
}
finally {
  await client.end()
}

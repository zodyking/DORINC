// Dev helper: mint a session for a user (default: the Super Admin) and print
// the cookie value. Usage: node scripts/dev-session.mjs [email]
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'

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
  const email = process.argv[2] ?? 'devon@dorinc.local'
  const { rows } = await client.query('select id from users where email = $1', [email])
  if (!rows[0]) throw new Error(`no user ${email}`)

  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await client.query(
    `insert into sessions (user_id, token_hash, expires_at) values ($1, $2, now() + interval '7 days')`,
    [rows[0].id, tokenHash],
  )
  console.log(token)
}
finally {
  await client.end()
}

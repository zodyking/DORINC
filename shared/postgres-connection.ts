export interface PostgresConnectionFields {
  host: string
  port: number
  database: string
  username: string
  password: string
}

/** Parse Dockploy-style `postgresql://user:pass@host:5432/db` connection strings. */
export function parsePostgresConnectionString(input: string): PostgresConnectionFields {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('Connection string is required')
  }

  let url: URL
  try {
    const normalized = trimmed.replace(/^postgres:\/\//i, 'postgresql://')
    url = new URL(normalized)
  }
  catch {
    throw new Error('Invalid PostgreSQL connection string — use postgresql://user:pass@host:5432/database')
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('Connection string must start with postgresql://')
  }

  const host = url.hostname.trim()
  if (!host) {
    throw new Error('Connection string must include a host')
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, '')).trim()
  if (!database) {
    throw new Error('Connection string must include a database name')
  }

  const username = decodeURIComponent(url.username).trim()
  if (!username) {
    throw new Error('Connection string must include a username')
  }

  const port = url.port ? Number(url.port) : 5432
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Connection string port must be between 1 and 65535')
  }

  return {
    host,
    port,
    database,
    username,
    password: decodeURIComponent(url.password),
  }
}

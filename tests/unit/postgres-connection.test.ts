import { describe, expect, it } from 'vitest'
import { parsePostgresConnectionString } from '../../shared/postgres-connection'

describe('parsePostgresConnectionString', () => {
  it('parses Dockploy-style postgresql URLs', () => {
    expect(parsePostgresConnectionString(
      'postgresql://postgres:secret@dorinc-suite-data-aa6dyg:5432/postgres',
    )).toEqual({
      host: 'dorinc-suite-data-aa6dyg',
      port: 5432,
      database: 'postgres',
      username: 'postgres',
      password: 'secret',
    })
  })

  it('accepts postgres:// scheme and URL-encoded credentials', () => {
    expect(parsePostgresConnectionString(
      'postgres://user%40mail:p%40ss%2Fword@db.internal:5433/my_db',
    )).toEqual({
      host: 'db.internal',
      port: 5433,
      database: 'my_db',
      username: 'user@mail',
      password: 'p@ss/word',
    })
  })

  it('rejects non-URL input', () => {
    expect(() => parsePostgresConnectionString('dorinc-suite-data-aa6dyg')).toThrow(/Invalid PostgreSQL connection string/)
  })

  it('rejects missing database name', () => {
    expect(() => parsePostgresConnectionString('postgresql://postgres:secret@localhost:5432/')).toThrow(/database name/)
  })
})

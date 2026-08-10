import { describe, expect, it } from 'vitest'
import { isSusanSystemEmail, SUSAN_SYSTEM_EMAIL } from '../../shared/ai-assistant'

describe('Susan system account identity', () => {
  it('recognizes the locked system email case-insensitively', () => {
    expect(SUSAN_SYSTEM_EMAIL).toBe('susan.ai@dorinc.system')
    expect(isSusanSystemEmail(SUSAN_SYSTEM_EMAIL)).toBe(true)
    expect(isSusanSystemEmail('Susan.AI@dorinc.system')).toBe(true)
    expect(isSusanSystemEmail(' admin@example.com ')).toBe(false)
    expect(isSusanSystemEmail(null)).toBe(false)
  })
})

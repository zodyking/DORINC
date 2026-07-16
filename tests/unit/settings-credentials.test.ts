import { describe, expect, it } from 'vitest'
import { isSavedPasswordMask, passwordForSave, SAVED_PASSWORD_MASK } from '../../app/utils/settings-credentials'

describe('settings-credentials', () => {
  it('detects saved password mask', () => {
    expect(isSavedPasswordMask(SAVED_PASSWORD_MASK)).toBe(true)
    expect(isSavedPasswordMask('secret')).toBe(false)
  })

  it('omits password on save when mask is unchanged', () => {
    expect(passwordForSave(SAVED_PASSWORD_MASK, true)).toBeUndefined()
    expect(passwordForSave('', true)).toBeUndefined()
  })

  it('requires password for first-time setup', () => {
    expect(passwordForSave('', false)).toBe('')
    expect(passwordForSave(SAVED_PASSWORD_MASK, false)).toBe('')
  })

  it('passes through a newly entered password', () => {
    expect(passwordForSave('new-secret', true)).toBe('new-secret')
  })
})

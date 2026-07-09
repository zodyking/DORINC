import { describe, expect, it } from 'vitest'
import {
  portalAccountKindLabel,
  portalMustChangePasswordNote,
} from '../../app/utils/portal-account-ui'

describe('portal-account-ui helpers (P2-08)', () => {
  it('labels account kinds', () => {
    expect(portalAccountKindLabel('fleet')).toBe('Fleet account')
    expect(portalAccountKindLabel('individual')).toBe('Individual account')
  })

  it('shows must-change-password note when required', () => {
    expect(portalMustChangePasswordNote(true)).toContain('temporary credential')
    expect(portalMustChangePasswordNote(false)).toBeNull()
  })
})

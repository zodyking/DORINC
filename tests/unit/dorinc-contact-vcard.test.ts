import { describe, expect, it } from 'vitest'
import {
  buildDorincContactVCard,
  DORINC_CONTACT_DISPLAY_NAME,
  DORINC_CONTACT_PHONE_LABEL,
  foldVCardLine,
} from '../../shared/dorinc-contact-vcard'
import { SMS_TEMPLATE_CATALOG, smsCatalogDefaultBodies } from '../../shared/sms-template-catalog'
import { SMS_DEFAULT_BODIES } from '../../server/workers/lib/sms-notify.mjs'

describe('dorinc contact vcard', () => {
  it('builds an Apple-friendly vCard with Susan Ai phone label and photo', () => {
    const photo = Buffer.from('fake-png-bytes')
    const vcf = buildDorincContactVCard({
      phoneE164: '+15555550123',
      photo: { bytes: photo, contentType: 'image/png' },
      orgName: 'DORINC',
    })

    expect(vcf).toContain('BEGIN:VCARD')
    expect(vcf).toContain(`FN:${DORINC_CONTACT_DISPLAY_NAME}`)
    expect(vcf).toContain('item1.TEL;type=pref:+15555550123')
    expect(vcf).toContain(`item1.X-ABLabel:${DORINC_CONTACT_PHONE_LABEL}`)
    expect(vcf).toContain('PHOTO;ENCODING=b;TYPE=PNG:')
    expect(vcf).toContain('END:VCARD')
  })

  it('folds long PHOTO lines', () => {
    const long = `PHOTO;ENCODING=b;TYPE=PNG:${'A'.repeat(200)}`
    const folded = foldVCardLine(long)
    expect(folded.split('\r\n').every(line => line.length <= 75)).toBe(true)
  })

  it('includes contact card SMS template', () => {
    const keys = SMS_TEMPLATE_CATALOG.map(t => t.typeKey)
    expect(keys).toContain('dorinc_contact_card')
    expect(keys).not.toContain('susan_sms_ready')
    expect(SMS_DEFAULT_BODIES).toEqual(smsCatalogDefaultBodies())
  })
})

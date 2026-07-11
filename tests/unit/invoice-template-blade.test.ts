import { describe, expect, it } from 'vitest'
import {
  coerceLayoutMarkerForStorage,
  isLegacyAccentBladeSource,
  normalizeInvoiceTemplateDesign,
  resolveEffectiveBladeSource,
} from '../../shared/invoice-template-blade'
import { BLADE_INVOICE_TEMPLATE_MARKER, DEFAULT_INVOICE_TEMPLATE_DESIGN } from '../../shared/invoice-template-design'

describe('invoice-template-blade', () => {
  it('detects legacy accent-driven blade sources', () => {
    expect(isLegacyAccentBladeSource('@php $accent = $doc[\'design\'][\'accentColor\']; @endphp')).toBe(true)
    expect(isLegacyAccentBladeSource('<div style="background:#ffd400"></div>')).toBe(true)
    expect(isLegacyAccentBladeSource('<div class="accent-bar"></div>')).toBe(true)
    expect(isLegacyAccentBladeSource(BLADE_INVOICE_TEMPLATE_MARKER)).toBe(false)
    expect(isLegacyAccentBladeSource('@php $ink = \'#0a0a0a\'; @endphp')).toBe(false)
  })

  it('normalizes design tokens to monochrome with safe margins', () => {
    const normalized = normalizeInvoiceTemplateDesign({
      ...DEFAULT_INVOICE_TEMPLATE_DESIGN,
      accentColor: '#ffd400',
      accentColor2: '#112233',
      marginInches: 0.5,
    })
    expect(normalized.accentColor).toBe('#0a0a0a')
    expect(normalized.accentColor2).toBe('#0a0a0a')
    expect(normalized.marginInches).toBe(0.75)
  })

  it('uses shipped view for legacy inline blades', () => {
    expect(resolveEffectiveBladeSource(BLADE_INVOICE_TEMPLATE_MARKER)).toBeNull()
    expect(resolveEffectiveBladeSource('<div class="accent-bar"></div>')).toBeNull()
    expect(resolveEffectiveBladeSource('@php $ink = "#0a0a0a"; @endphp')).toBe('@php $ink = "#0a0a0a"; @endphp')
  })

  it('coerces legacy blades to built-in marker on storage', () => {
    expect(coerceLayoutMarkerForStorage('<div class="accent-bar"></div>')).toBe(BLADE_INVOICE_TEMPLATE_MARKER)
    expect(coerceLayoutMarkerForStorage('@php $ink = "#0a0a0a"; @endphp')).toBe('@php $ink = "#0a0a0a"; @endphp')
  })
})

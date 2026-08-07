import { describe, expect, it } from 'vitest'
import {
  CONTROL_PANEL_GROUPS,
  CONTROL_PANEL_SECTION_IDS,
  controlPanelSectionById,
  emptyControlPanelOpenState,
} from '../../app/utils/control-panel-nav'

describe('control-panel-nav', () => {
  it('keeps unique section ids in a stable logical order', () => {
    expect(new Set(CONTROL_PANEL_SECTION_IDS).size).toBe(CONTROL_PANEL_SECTION_IDS.length)
    expect(CONTROL_PANEL_SECTION_IDS[0]).toBe('business')
    expect(CONTROL_PANEL_SECTION_IDS.at(-1)).toBe('security')
    expect(CONTROL_PANEL_GROUPS.map(g => g.label)).toEqual([
      'Workspace',
      'Communications',
      'Platform',
    ])
  })

  it('uses Title Case section titles', () => {
    for (const group of CONTROL_PANEL_GROUPS) {
      for (const section of group.sections) {
        expect(section.title).toBe(section.title.trim())
        expect(section.title).not.toMatch(/^[a-z]/) // no leading lowercase word
        expect(section.title).not.toBe(section.title.toLowerCase())
      }
    }
    expect(controlPanelSectionById('catalog')?.title).toBe('Catalog Detection')
    expect(controlPanelSectionById('ai')?.title).toBe('Artificial Intelligence')
  })

  it('builds a closed open-state map for every section', () => {
    const state = emptyControlPanelOpenState()
    expect(Object.keys(state).sort()).toEqual([...CONTROL_PANEL_SECTION_IDS].sort())
    expect(Object.values(state).every(v => v === false)).toBe(true)
  })
})

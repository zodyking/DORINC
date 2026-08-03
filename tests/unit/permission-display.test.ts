import { describe, expect, it } from 'vitest'
import {
  PERMISSION_AREAS,
  canViewPage,
  cellsForColumn,
  resolvePermissionStatus,
  staffPermissionAreas,
} from '../../shared/permissions/display'

describe('permission display', () => {
  it('groups service logs with view as first column', () => {
    const area = PERMISSION_AREAS.find(a => a.id === 'service_logs')!
    const viewCells = cellsForColumn(area, 'view')
    expect(viewCells.map(c => c.key)).toEqual([
      'service_logs.read.all',
      'service_logs.read.own',
    ])
    expect(area.navKeys).toEqual(['service_logs.read.all', 'service_logs.read.own'])
  })

  it('resolves override allow before role grant', () => {
    const status = resolvePermissionStatus(
      'ai.help.all',
      'Help assistant',
      new Set<string>(),
      { 'ai.help.all': 'allow' },
    )
    expect(status.granted).toBe(true)
    expect(status.override).toBe('allow')
  })

  it('resolves override deny over role grant', () => {
    const status = resolvePermissionStatus(
      'vehicles.read.all',
      'View page',
      new Set(['vehicles.read.all']),
      { 'vehicles.read.all': 'deny' },
    )
    expect(status.granted).toBe(false)
    expect(status.override).toBe('deny')
  })

  it('detects page visibility from nav keys', () => {
    const area = PERMISSION_AREAS.find(a => a.id === 'service_logs')!
    expect(canViewPage(area, new Set(['service_logs.read.own']), {})).toBe(true)
    expect(canViewPage(area, new Set(['service_logs.upload.own']), {})).toBe(false)
  })

  it('excludes customer portal from staff areas', () => {
    expect(staffPermissionAreas().some(a => a.id === 'portal')).toBe(false)
  })
})

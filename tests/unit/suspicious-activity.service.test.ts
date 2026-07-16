import { describe, expect, it } from 'vitest'
import { collectUniqueIps } from '../../server/services/suspicious-activity.service'

describe('suspicious-activity.service helpers', () => {
  it('collectUniqueIps deduplicates and preserves order', () => {
    expect(collectUniqueIps(['1.2.3.4', '1.2.3.4', '5.6.7.8', null, '', ' 5.6.7.8 '])).toEqual([
      '1.2.3.4',
      '5.6.7.8',
    ])
  })
})

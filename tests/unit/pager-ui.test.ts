import { describe, expect, it } from 'vitest'
import { listRangeLabel, windowedPagerPages } from '../../app/utils/pager-ui'

describe('pager-ui', () => {
  it('returns empty array for single page', () => {
    expect(windowedPagerPages(1, 1)).toEqual([])
  })

  it('windows large page counts', () => {
    const pages = windowedPagerPages(50, 100)
    expect(pages.length).toBe(12)
    expect(pages[0]).toBe(46)
    expect(pages.at(-1)).toBe(57)
  })

  it('formats list range labels', () => {
    expect(listRangeLabel(2, 25, 60)).toBe('Showing 26–50 of 60')
    expect(listRangeLabel(1, 25, 0)).toBe('No results')
  })
})

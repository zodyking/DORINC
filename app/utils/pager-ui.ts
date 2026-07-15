/** Windowed page numbers for list footers (avoids rendering hundreds of pager buttons). */
export function windowedPagerPages(page: number, pageCount: number, maxVisible = 12): number[] {
  if (pageCount <= 1) return []
  if (pageCount <= maxVisible) {
    return Array.from({ length: pageCount }, (_, i) => i + 1)
  }
  const start = Math.max(1, Math.min(page - 4, pageCount - (maxVisible - 1)))
  const end = Math.min(pageCount, start + maxVisible - 1)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

export function listRangeLabel(page: number, pageSize: number, total: number): string {
  if (total <= 0) return 'No results'
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return `Showing ${start}–${end} of ${total}`
}

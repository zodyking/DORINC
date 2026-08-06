/** Advance the login-message queue without shrinking the session total. */
export function advanceAnnouncementQueue<T extends { index: number, total: number }>(
  items: T[],
): T[] {
  if (items.length <= 1) return []
  const sessionTotal = items[0]!.total
  return items.slice(1).map((item, offset) => ({
    ...item,
    // Keep absolute position in the original session (2 of 3, 3 of 3, …).
    index: (items[0]!.index + 1) + offset,
    total: sessionTotal,
  }))
}

/**
 * IMAP delete helpers for Staples PrintMe confirmation emails.
 * Used when an order is removed, or a PrintMe reply does not match an open job.
 */

/**
 * @param {{ matched?: boolean, reason?: string } | null | undefined} result
 */
export function shouldDeleteUnmatchedPrintMeReply(result) {
  return Boolean(result && result.matched === false && result.reason === 'no_job')
}

/**
 * IMAP HEADER Message-ID search is server-specific about angle brackets.
 * @param {string | null | undefined} raw
 * @returns {string[]}
 */
export function internetMessageIdVariants(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return []
  const bare = trimmed.replace(/^<|>$/g, '').trim()
  if (!bare) return []
  return [...new Set([trimmed, bare, `<${bare}>`])]
}

/**
 * Permanently delete messages by UID (must not be called inside a fetch() loop).
 * @param {import('imapflow').ImapFlow} client
 * @param {Array<number | string | null | undefined>} uids
 */
export async function deleteImapUids(client, uids) {
  const unique = [...new Set(
    (uids ?? [])
      .map(v => Number(v))
      .filter(n => Number.isFinite(n) && n > 0),
  )]
  if (!unique.length) return 0
  await client.messageDelete(unique, { uid: true })
  return unique.length
}

/**
 * Find inbox UIDs for RFC Message-IDs and delete them.
 * @param {import('imapflow').ImapFlow} client
 * @param {Array<string | null | undefined>} messageIds
 */
export async function deleteImapByInternetMessageIds(client, messageIds) {
  /** @type {number[]} */
  const uids = []
  for (const id of messageIds ?? []) {
    for (const variant of internetMessageIdVariants(id)) {
      try {
        const found = await client.search(
          { header: { 'Message-ID': variant } },
          { uid: true },
        )
        if (Array.isArray(found)) {
          for (const uid of found) {
            const n = Number(uid)
            if (Number.isFinite(n) && n > 0) uids.push(n)
          }
        }
      }
      catch {
        // Some IMAP servers reject HEADER Message-ID; try the next variant.
      }
    }
  }
  return deleteImapUids(client, uids)
}

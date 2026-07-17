export const MESSAGE_LINK_REF = 'message'

export function isMessageLinkRoute(query: Record<string, unknown>): boolean {
  return query.ref === MESSAGE_LINK_REF
}

export function messageLinkFetchQuery(query: Record<string, unknown>): { ref?: string } {
  return isMessageLinkRoute(query) ? { ref: MESSAGE_LINK_REF } : {}
}

/**
 * Normalize Quo / OpenPhone message.received webhook payloads.
 * Supports both the 2026-03-30 shape (`data.resource` + `data.context`)
 * and older `data.object` payloads.
 */

export interface ParsedQuoInboundMessage {
  messageId: string | null
  direction: string | null
  fromPhone: string | null
  toPhone: string | null
  body: string
  rawType: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function firstString(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate)
  }
  return null
}

function firstPhoneFromUnknown(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return firstString(value)
  if (Array.isArray(value)) {
    for (const item of value) {
      const phone = firstPhoneFromUnknown(item)
      if (phone) return phone
    }
  }
  const row = asRecord(value)
  if (!row) return null
  return firstString(
    row.phoneNumber,
    row.number,
    row.e164,
    row.identifier,
    row.value,
  )
}

/** Extract inbound SMS fields from a Quo webhook JSON body. */
export function parseQuoMessageReceivedPayload(payload: unknown): ParsedQuoInboundMessage {
  const root = asRecord(payload) ?? {}
  const rawType = firstString(root.type, root.event)
  const data = asRecord(root.data) ?? root

  // 2026-03-30 unified webhook shape
  const resource = asRecord(data.resource)
  const context = asRecord(data.context)

  // Legacy OpenPhone / support-docs shape
  const object = asRecord(data.object) ?? (resource ? null : data)

  const direction = firstString(
    resource?.direction,
    object?.direction,
    data.direction,
  )?.toLowerCase() ?? null

  const body = firstString(
    resource?.text,
    resource?.body,
    resource?.content,
    object?.text,
    object?.body,
    object?.content,
    data.text,
    data.body,
    data.content,
  ) ?? ''

  const fromPhone = firstPhoneFromUnknown(
    context?.senderIdentifier
    ?? object?.from
    ?? object?.fromPhoneNumber
    ?? data.from
    ?? data.fromPhoneNumber
    ?? resource?.from,
  )

  const toPhone = firstPhoneFromUnknown(
    context?.recipientIdentifiers
    ?? object?.to
    ?? object?.toPhoneNumber
    ?? data.to
    ?? data.toPhoneNumber
    ?? resource?.to,
  )

  const messageId = firstString(
    resource?.id,
    object?.id,
    data.id,
    root.id,
  )

  return {
    messageId,
    direction,
    fromPhone,
    toPhone,
    body,
    rawType,
  }
}

export function isQuoInboundDirection(direction: string | null | undefined): boolean {
  if (!direction) return true
  return direction === 'incoming' || direction === 'inbound'
}

// Direct messages UI helpers — entity refs, paths, and compose triggers.

import type { MessageEntityType } from '~/server/db/schema/messages'
import { MESSAGE_LINK_REF } from './message-link-access'

export { MESSAGE_LINK_REF }

export interface EntityRefToken {
  entityType: MessageEntityType
  entityId: string
  entityLabel: string
}

export interface EntitySearchItem {
  id: string
  label: string
  sublabel?: string | null
  entityType: MessageEntityType
}

export const ENTITY_REF_TOKEN_RE = /\[\[ref:([a-z_]+):([0-9a-f-]{36}):([^\]]+)\]\]/gi

export const ENTITY_TRIGGER_KEYWORDS: Record<string, MessageEntityType> = {
  invoice: 'invoice',
  invoices: 'invoice',
  customer: 'customer',
  customers: 'customer',
  vehicle: 'vehicle',
  vehicles: 'vehicle',
  servicelog: 'service_log',
  'service log': 'service_log',
  'service logs': 'service_log',
  'service-log': 'service_log',
  'service-logs': 'service_log',
}

export const ENTITY_TYPE_LABELS: Record<MessageEntityType, string> = {
  invoice: 'Invoice',
  customer: 'Customer',
  vehicle: 'Vehicle',
  service_log: 'Service log',
}

export function entityRefToken(ref: EntityRefToken): string {
  return `[[ref:${ref.entityType}:${ref.entityId}:${ref.entityLabel}]]`
}

export function entityPath(entityType: MessageEntityType, entityId: string): string {
  switch (entityType) {
    case 'invoice':
      return `/invoices/${entityId}`
    case 'customer':
      return `/customers/${entityId}`
    case 'vehicle':
      return `/vehicles/${entityId}`
    case 'service_log':
      return `/service-logs/${entityId}`
    default:
      return '/'
  }
}

export interface MessageLinkAccess {
  can: (key: string) => boolean
}

/** Route targets for entity refs embedded in team/DM messages. */
export function entityPathForMessageLink(
  entityType: MessageEntityType,
  entityId: string,
  access: MessageLinkAccess,
): string {
  const refQuery = `ref=${MESSAGE_LINK_REF}`
  switch (entityType) {
    case 'invoice':
      if (access.can('invoices.update.all') || access.can('invoices.create.all')) {
        return `/invoices/${entityId}/edit?${refQuery}`
      }
      return `/invoices/${entityId}?view=pdf&${refQuery}`
    case 'customer':
      return `/customers/${entityId}?${refQuery}`
    case 'vehicle':
      return `/vehicles/${entityId}?${refQuery}`
    case 'service_log':
      return `/service-logs/${entityId}?${refQuery}`
    default:
      return '/'
  }
}

export function detectEntityTrigger(text: string, cursorPos: number): {
  keyword: string
  entityType: MessageEntityType
  start: number
  end: number
} | null {
  const before = text.slice(0, cursorPos)
  const lastBreak = Math.max(
    before.lastIndexOf(' '),
    before.lastIndexOf('\n'),
    before.lastIndexOf('('),
    before.lastIndexOf('\t'),
  )
  const keyword = before.slice(lastBreak + 1).toLowerCase().trim()
  if (!keyword) return null

  const entityType = ENTITY_TRIGGER_KEYWORDS[keyword]
  if (!entityType) return null

  const start = lastBreak + 1
  return { keyword, entityType, start, end: cursorPos }
}

export function renderMessageBody(body: string): string {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return escaped.replace(
    ENTITY_REF_TOKEN_RE,
    (_, type: string, id: string, label: string) => {
      const path = entityPath(type as MessageEntityType, id)
      const safeLabel = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return `<a href="${path}" class="dm-entity-link" data-entity-type="${type}">${safeLabel}</a>`
    },
  )
}

export function messagePreviewText(body: string): string {
  const stripped = body.replace(ENTITY_REF_TOKEN_RE, (_, _type: string, _id: string, label: string) => label)
  return stripped.length > 120 ? `${stripped.slice(0, 117)}…` : stripped
}

export function formatMessageTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export const DM_POLL_MS = 4000

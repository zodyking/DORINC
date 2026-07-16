import { randomUUID } from 'node:crypto'

export function normalizeEmailAddress(raw) {
  const match = String(raw ?? '').match(/<([^>]+)>/)
  return (match?.[1] ?? String(raw ?? '')).trim().toLowerCase()
}

export function extractEmailAddresses(raw) {
  if (!raw) return []
  const list = Array.isArray(raw) ? raw : [raw]
  return list.flatMap(item => String(item).split(',')).map(normalizeEmailAddress).filter(Boolean)
}

export function subjectWithRePrefix(subject) {
  const trimmed = String(subject ?? '').trim()
  if (/^re:/i.test(trimmed)) return trimmed
  return `Re: ${trimmed}`
}

export function generateInternetMessageId(domain = 'dorinc.local') {
  return `<${randomUUID()}@${domain}>`
}

export function buildReferences(existing, parentId) {
  const parts = String(existing ?? '').split(/\s+/).filter(Boolean)
  if (parentId && !parts.includes(parentId)) parts.push(parentId)
  return parts.length ? parts.join(' ') : null
}

export function messageIdDomain(fromAddress) {
  const normalized = normalizeEmailAddress(fromAddress)
  return normalized.split('@')[1] || 'dorinc.local'
}

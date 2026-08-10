import { describe, expect, it, vi } from 'vitest'
import { enqueueRecipientNotification, resolveSmsBody } from '../../server/workers/lib/sms-notify.mjs'

describe('worker sms-notify', () => {
  it('resolves catalog defaults when template row is inactive', async () => {
    const pool = {
      query: vi.fn(async () => ({ rows: [{ is_active: false, content: { body: 'ignored' } }] })),
    }
    const body = await resolveSmsBody(pool, 'deletion_request_result', {
      brandName: 'Acme',
      entityTypeLabel: 'Invoice',
      entityLabel: 'INV-1',
      status: 'approved',
      detailLine: 'Reviewed by Pat.',
    })
    expect(body).toContain('Acme')
    expect(body).toContain('approved')
    expect(body).toContain('INV-1')
  })

  it('queues sms_send when Quo is on and recipient prefers Text', async () => {
    const jobs: Array<{ jobType: string, payload: Record<string, unknown> }> = []
    const pool = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        const text = String(sql)
        if (text.includes('FROM sms_templates')) {
          return { rows: [] }
        }
        if (text.startsWith('INSERT INTO worker_jobs')) {
          const payload = typeof params[0] === 'string' ? JSON.parse(params[0]) : params[0]
          const jobType = text.includes("'sms_send'") ? 'sms_send' : 'email_send'
          jobs.push({ jobType, payload: payload as Record<string, unknown> })
          return { rowCount: 1 }
        }
        throw new Error(`Unhandled: ${text}`)
      }),
    }

    const channel = await enqueueRecipientNotification(pool, {
      recipient: {
        id: 'u1',
        email: 'pat@example.com',
        phone: '+15551234567',
        message_notify_channel: 'sms',
      },
      quoOn: true,
      smsTypeKey: 'chat_message_received',
      smsVars: {
        brandName: 'Acme',
        senderName: 'Alex',
        channelLabel: 'Team',
        messagePreview: 'Hello',
        messagesUrl: 'https://example.com/messages',
      },
      email: { subject: 'Team', text: 'Hello', html: '<p>Hello</p>' },
      meta: { conversationId: 'c1' },
    })

    expect(channel).toBe('sms')
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.jobType).toBe('sms_send')
    expect(jobs[0]!.payload.to).toBe('+15551234567')
    expect(String(jobs[0]!.payload.body)).toContain('Alex')
  })

  it('queues email_send when recipient prefers Email', async () => {
    const jobs: Array<{ jobType: string }> = []
    const pool = {
      query: vi.fn(async (sql: string) => {
        const text = String(sql)
        if (text.startsWith('INSERT INTO worker_jobs')) {
          jobs.push({ jobType: text.includes("'sms_send'") ? 'sms_send' : 'email_send' })
          return { rowCount: 1 }
        }
        throw new Error(`Unhandled: ${text}`)
      }),
    }

    const channel = await enqueueRecipientNotification(pool, {
      recipient: {
        id: 'u1',
        email: 'pat@example.com',
        phone: '+15551234567',
        message_notify_channel: 'email',
      },
      quoOn: true,
      smsTypeKey: 'chat_message_received',
      smsVars: { brandName: 'Acme' },
      email: { subject: 'Team', text: 'Hello', html: '<p>Hello</p>' },
    })

    expect(channel).toBe('email')
    expect(jobs).toEqual([{ jobType: 'email_send' }])
  })
})

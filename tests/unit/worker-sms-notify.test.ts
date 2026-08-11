import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadQuoConfig = vi.fn()

vi.mock('../../server/workers/lib/app-config.mjs', () => ({
  loadQuoConfig: (...args: unknown[]) => loadQuoConfig(...args),
}))

describe('worker sms-notify', () => {
  beforeEach(() => {
    vi.resetModules()
    loadQuoConfig.mockReset()
    vi.unstubAllGlobals()
  })

  it('resolves catalog defaults when template row is inactive', async () => {
    const { resolveSmsBody } = await import('../../server/workers/lib/sms-notify.mjs')
    const pool = {
      query: vi.fn(async () => ({ rows: [{ is_active: false, content: { body: 'ignored' } }] })),
    }
    const body = await resolveSmsBody(pool, 'deletion_request_result', {
      brandName: 'Acme',
      entityTypeLabel: 'Invoice',
      entityLabel: 'INV-1',
      statusLabel: 'Approved',
      reviewedByName: 'Pat',
      reviewReason: '',
      detailLine: 'Reviewed by Pat.',
      requestorName: 'Jordan',
    })
    expect(body).toContain('Acme')
    expect(body).toContain('Approved')
    expect(body).toContain('INV-1')
    expect(body).toContain('Deletion request')
  })

  it('sends SMS directly via Quo when recipient prefers Text', async () => {
    loadQuoConfig.mockResolvedValue({
      enabled: true,
      apiKey: 'sk_test',
      fromNumber: '+15165184847',
    })
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ id: 'm1' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const jobs: string[] = []
    const pool = {
      query: vi.fn(async (sql: string) => {
        const text = String(sql)
        if (text.includes('FROM sms_templates')) return { rows: [] }
        if (text.startsWith('INSERT INTO worker_jobs')) {
          jobs.push(text.includes("'sms_send'") ? 'sms_send' : 'email_send')
          return { rowCount: 1 }
        }
        throw new Error(`Unhandled: ${text}`)
      }),
    }

    const { enqueueRecipientNotification } = await import('../../server/workers/lib/sms-notify.mjs')
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
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/v1/messages')
    expect(jobs).toEqual([])
  })

  it('queues email_send when recipient prefers Email', async () => {
    const jobs: string[] = []
    const pool = {
      query: vi.fn(async (sql: string) => {
        const text = String(sql)
        if (text.startsWith('INSERT INTO worker_jobs')) {
          jobs.push(text.includes("'sms_send'") ? 'sms_send' : 'email_send')
          return { rowCount: 1 }
        }
        throw new Error(`Unhandled: ${text}`)
      }),
    }

    const { enqueueRecipientNotification } = await import('../../server/workers/lib/sms-notify.mjs')
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
    expect(jobs).toEqual(['email_send'])
  })
})

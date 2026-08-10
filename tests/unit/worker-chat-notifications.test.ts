import { describe, expect, it, vi } from 'vitest'
import { notifyChatMessageReceivedWorker } from '../../server/workers/lib/chat-notifications.mjs'

function createPool(state: {
  jobs?: Array<Record<string, unknown>>
  quoEnabled?: boolean
  recipients?: Array<Record<string, unknown>>
}) {
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const text = String(sql)

      if (text.includes('FROM conversations WHERE id')) {
        return { rows: [{ type: 'team', title: 'Team' }] }
      }

      if (text.includes('SELECT name FROM users WHERE id = $1') && params[0] === 'sender-1') {
        return { rows: [{ name: 'Alex Admin' }] }
      }

      if (text.includes('FROM conversation_participants')) {
        return { rows: [{ user_id: 'staff-2' }] }
      }

      if (text.includes('message_notify_channel') || text.includes('message_email_notify')) {
        return {
          rows: state.recipients ?? [{
            id: 'staff-2',
            name: 'Pat Staff',
            email: 'pat@example.com',
            phone: '+15551234567',
            message_notify_channel: 'email',
            message_email_notify: true,
          }],
        }
      }

      if (text.includes(`key = 'workspace.business_profile'`)) {
        return { rows: [{ value: { businessName: 'Acme Shop' } }] }
      }

      if (text.includes('FROM app_settings WHERE key = ANY') && text.includes('encrypted_value')) {
        if (!state.quoEnabled) return { rows: [] }
        return {
          rows: [
            { key: 'security.master_key', value: { hex: 'a'.repeat(64) }, encrypted_value: null },
            // Intentionally no decryptable quo row — worker treats missing decrypt as disabled
          ],
        }
      }

      if (text.includes('FROM sms_templates')) {
        return { rows: [] }
      }

      if (text.startsWith('INSERT INTO worker_jobs')) {
        const payload = typeof params[0] === 'string' ? JSON.parse(params[0]) : params[0]
        // INSERT uses job_type as literal in SQL for our worker; recover from SQL string
        const jobType = text.includes("'sms_send'") ? 'sms_send' : 'email_send'
        state.jobs = [...(state.jobs ?? []), { jobType, ...(payload as object) }]
        return { rowCount: 1 }
      }

      throw new Error(`Unhandled query: ${text}`)
    }),
  }
}

describe('worker chat notifications', () => {
  it('queues email_send jobs for team chat participants with notifications enabled', async () => {
    const state = {}
    const pool = createPool(state)

    const result = await notifyChatMessageReceivedWorker(pool, {
      conversationId: 'team-1',
      messageId: 'msg-1',
      senderUserId: 'sender-1',
      body: '[[ref:invoice:11111111-1111-4111-8111-111111111111:INV-000711]] has been resent to Fleet Co',
      isTeamChat: true,
    })

    expect(result).toEqual({ queued: 1 })
    expect(state.jobs).toHaveLength(1)
    expect(state.jobs![0]!.to).toBe('pat@example.com')
    expect(state.jobs![0]!.notificationKind).toBe('chat_message_received')
    expect(state.jobs![0]!.subject).toContain('Team Message')
    expect(state.jobs![0]!.text).toContain('INV-000711 has been resent to Fleet Co')
  })
})

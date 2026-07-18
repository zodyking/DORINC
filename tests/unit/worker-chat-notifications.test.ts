import { describe, expect, it, vi } from 'vitest'
import { notifyChatMessageReceivedWorker } from '../../server/workers/lib/chat-notifications.mjs'

function createPool(state) {
  return {
    query: vi.fn(async (sql, params = []) => {
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

      if (text.includes('message_email_notify = true')) {
        return {
          rows: [{
            id: 'staff-2',
            name: 'Pat Staff',
            email: 'pat@example.com',
          }],
        }
      }

      if (text.includes(`key = 'workspace.business_profile'`)) {
        return { rows: [{ value: { businessName: 'Acme Shop' } }] }
      }

      if (text.startsWith('INSERT INTO worker_jobs')) {
        state.jobs = [...(state.jobs ?? []), JSON.parse(String(params[0]))]
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
    expect(state.jobs[0].to).toBe('pat@example.com')
    expect(state.jobs[0].notificationKind).toBe('chat_message_received')
    expect(state.jobs[0].subject).toContain('Team Message')
    expect(state.jobs[0].text).toContain('INV-000711 has been resent to Fleet Co')
  })
})

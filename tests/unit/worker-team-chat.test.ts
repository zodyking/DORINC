import { describe, expect, it, vi } from 'vitest'
import {
  ensureDefaultTeamConversation,
  getDefaultTeamConversationId,
  insertTeamChatMessage,
} from '../../server/workers/lib/team-chat.mjs'

function createPool(state) {
  return {
    query: vi.fn(async (sql, params = []) => {
      const text = String(sql)

      if (text.includes(`type = 'team' AND is_system = true`)) {
        return { rows: state.systemTeamId ? [{ id: state.systemTeamId }] : [] }
      }

      if (text.includes(`WHERE type = 'team'`) && text.includes('ORDER BY created_at')) {
        return { rows: state.legacyTeamId ? [{ id: state.legacyTeamId }] : [] }
      }

      if (text.startsWith('UPDATE conversations') && text.includes('is_system = true')) {
        state.promotedId = params[0]
        return { rowCount: 1 }
      }

      if (text.startsWith('INSERT INTO conversations')) {
        state.createdTeam = true
        state.systemTeamId = state.systemTeamId ?? 'team-new-1'
        return { rows: [{ id: state.systemTeamId }] }
      }

      if (text.includes('FROM users u') && text.includes('team_chat_enabled')) {
        return { rows: state.staffIds?.map(id => ({ id })) ?? [] }
      }

      if (text.includes('FROM conversation_participants')) {
        const rows = (state.participants ?? []).map(user_id => ({ user_id }))
        if (text.includes('user_id <>')) {
          const excludeId = params[1]
          return { rows: rows.filter(row => row.user_id !== excludeId) }
        }
        return { rows }
      }

      if (text.startsWith('INSERT INTO conversation_participants')) {
        state.participants = [...(state.participants ?? []), params[1]]
        return { rowCount: 1 }
      }

      if (text.startsWith('INSERT INTO messages')) {
        return { rows: [{ id: 'msg-1' }] }
      }

      if (text.startsWith('INSERT INTO message_entity_refs')) {
        return { rowCount: 1 }
      }

      if (text.startsWith('UPDATE conversations SET updated_at')) {
        return { rowCount: 1 }
      }

      if (text.startsWith('INSERT INTO worker_jobs')) {
        state.emailJobs = [...(state.emailJobs ?? []), JSON.parse(String(params[0]))]
        return { rowCount: 1 }
      }

      if (text.startsWith('SELECT type, title FROM conversations')) {
        return { rows: [{ type: 'team', title: 'Team' }] }
      }

      if (text.includes('SELECT name FROM users WHERE id = $1')) {
        return { rows: [{ name: 'Staff User' }] }
      }

      if (text.includes('message_email_notify = true')) {
        return { rows: [] }
      }

      if (text.includes(`key = 'workspace.business_profile'`)) {
        return { rows: [{ value: { businessName: 'Acme Shop' } }] }
      }

      throw new Error(`Unhandled query: ${text}`)
    }),
  }
}

describe('worker team chat', () => {
  it('recreates the team channel when it was removed', async () => {
    const state = { staffIds: ['staff-1'] }
    const pool = createPool(state)

    const conversationId = await ensureDefaultTeamConversation(pool)
    expect(conversationId).toBe('team-new-1')
    expect(state.createdTeam).toBe(true)
    expect(state.participants).toEqual(['staff-1'])
  })

  it('promotes a legacy team conversation missing is_system', async () => {
    const state = {
      legacyTeamId: 'legacy-team-1',
      staffIds: ['staff-1'],
      participants: ['staff-1'],
    }
    const pool = createPool(state)

    const conversationId = await ensureDefaultTeamConversation(pool)
    expect(conversationId).toBe('legacy-team-1')
    expect(state.promotedId).toBe('legacy-team-1')
    expect(state.createdTeam).toBeUndefined()
  })

  it('posts automated messages after ensuring the team channel exists', async () => {
    const state = {
      systemTeamId: 'team-1',
      staffIds: ['staff-1', 'staff-2'],
      participants: ['staff-1', 'staff-2'],
    }
    const pool = createPool(state)

    const result = await insertTeamChatMessage(pool, 'staff-1', 'Invoice sent', [])
    expect(result).toEqual({ conversationId: 'team-1', messageId: 'msg-1' })
  })

  it('queues chat email notifications for other team participants', async () => {
    const state = {
      systemTeamId: 'team-1',
      staffIds: ['staff-1', 'staff-2'],
      participants: ['staff-1', 'staff-2'],
    }
    const pool = createPool(state)

    const originalQuery = pool.query.getMockImplementation()
    pool.query.mockImplementation(async (sql, params = []) => {
      const text = String(sql)
      if (text.includes('message_email_notify = true')) {
        return {
          rows: [{
            id: 'staff-2',
            name: 'Pat Staff',
            email: 'pat@example.com',
          }],
        }
      }
      return originalQuery(sql, params)
    })

    await insertTeamChatMessage(pool, 'staff-1', 'Invoice resent', [])
    expect(state.emailJobs).toHaveLength(1)
    expect(state.emailJobs[0].to).toBe('pat@example.com')
    expect(state.emailJobs[0].notificationKind).toBe('chat_message_received')
  })

  it('finds legacy team conversations when system flag is missing', async () => {
    const state = { legacyTeamId: 'legacy-team-2' }
    const pool = createPool(state)
    await expect(getDefaultTeamConversationId(pool)).resolves.toBe('legacy-team-2')
  })
})

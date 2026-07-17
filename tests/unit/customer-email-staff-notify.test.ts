import { describe, expect, it, vi } from 'vitest'
import {
  buildCustomerEmailReceivedStaffEmail,
} from '../../server/mail/templates/system.mjs'
import {
  customerEmailStaffMessageBody,
  isCustomerEmailStaffNotifyEnabled,
  notifyCustomerEmailReceivedStaff,
} from '../../server/workers/lib/customer-email-staff-notify.mjs'

describe('customer-email-staff-notify worker helper', () => {
  it('builds full message body from plain text or html', () => {
    expect(customerEmailStaffMessageBody('Hello team', null)).toBe('Hello team')
    expect(customerEmailStaffMessageBody('', '<p>HTML <b>body</b></p>')).toContain('HTML body')
    expect(customerEmailStaffMessageBody('', null)).toBe('(empty message)')
  })

  it('respects notification toggle defaulting to enabled', async () => {
    const pool = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('workspace.notification_settings')) return { rows: [{}] }
        return { rows: [] }
      }),
    }
    await expect(isCustomerEmailStaffNotifyEnabled(pool)).resolves.toBe(true)
  })

  it('queues staff emails for all team members', async () => {
    const inserts: unknown[] = []
    const pool = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('workspace.notification_settings')) return { rows: [{ value: { customerEmailReceived: true } }] }
        if (sql.includes('workspace.business_profile')) {
          return { rows: [{ value: { businessName: 'Test Shop' } }] }
        }
        if (sql.includes('FROM users u')) {
          return {
            rows: [
              { id: 'u1', name: 'Alex', email: 'alex@example.com' },
              { id: 'u2', name: 'Pat', email: 'pat@example.com' },
            ],
          }
        }
        if (sql.includes('INSERT INTO worker_jobs')) {
          inserts.push(params?.[0])
          return { rows: [] }
        }
        return { rows: [] }
      }),
    }

    const result = await notifyCustomerEmailReceivedStaff(pool, {
      conversationId: 'conv-1',
      customerName: 'Fleet Co',
      customerEmail: 'fleet@example.com',
      subject: 'Invoice question',
      messageBody: 'Can you confirm the total?',
      htmlBody: null,
    })

    expect(result.queued).toBe(2)
    expect(inserts).toHaveLength(2)
    const payload = JSON.parse(String(inserts[0]))
    expect(payload.notificationKind).toBe('customer_email_received')
    expect(payload.to).toBe('alex@example.com')
    expect(payload.subject).toContain('Invoice question')
  })

  it('builds staff alert email with sign-in and reply instructions', () => {
    const appUrl = 'https://app.example.com'
    const mail = buildCustomerEmailReceivedStaffEmail({
      recipientName: 'Sam',
      customerName: 'Fleet Co',
      customerEmail: 'fleet@example.com',
      subject: 'Need help',
      messagePreview: 'Please call me back about the invoice.',
      messagesUrl: `${appUrl}/messages?conversation=abc`,
      appUrl,
      brand: {
        brandName: 'Test Shop',
        brandLegal: 'Test Shop',
        brandTagline: '',
        logoUrl: `${appUrl}/logo.png`,
        logoInitial: 'T',
        appUrl,
      },
    })

    expect(mail.html).toContain('Sign in &amp; reply')
    expect(mail.text).toContain('Sign in to DORINC')
    expect(mail.text).toContain('Please call me back about the invoice.')
    expect(mail.html).toContain('Customer message')
  })
})

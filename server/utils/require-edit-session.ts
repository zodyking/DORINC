import type { H3Event } from 'h3'
import type { Db } from '../db/client'
import type { EditableEntityType } from '../db/schema/editing-sessions'
import { assertEditingSessionHolder, EditingSessionsServiceError } from '../services/editing-sessions.service'
import { apiError } from './api-error'

/** Enforce editing-session lock before invoice/estimate mutations (SPEC §12). */
export async function requireEditSession(
  event: H3Event,
  db: Db,
  entityType: EditableEntityType,
  entityId: string,
  userId: string,
) {
  try {
    await assertEditingSessionHolder(db, entityType, entityId, userId)
  }
  catch (err) {
    if (err instanceof EditingSessionsServiceError) {
      if (err.code === 'SESSION_ACTIVE') {
        throw apiError(event, 'EDIT_SESSION_ACTIVE', 'Another user is editing this record', {
          editorName: err.details.editorName,
          editorUserId: err.details.editorUserId,
        })
      }
      if (err.code === 'SESSION_REQUIRED') {
        throw apiError(event, 'EDIT_SESSION_ACTIVE', 'Acquire an editing session before making changes')
      }
    }
    throw err
  }
}

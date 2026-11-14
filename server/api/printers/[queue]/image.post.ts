import { readMultipartFormData } from 'h3'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { apiError } from '../../../utils/api-error'
import { IMAGE_ACTIONS, imageIllustrationSchema, queueParamSchema } from '../../../../shared/validators/printers'
import { engineJson, printApiError } from '../../../services/printers'

const MAX_UPLOAD = 2_000_000

/** Choose a printer picture: a matching photo, an illustration, an upload, or automatic. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const params = validateParams(event, queueParamSchema)
  const parts = await readMultipartFormData(event) || []
  const fields: Record<string, string> = {}
  let upload: { filename: string, data: Buffer, type?: string } | undefined
  for (const part of parts) {
    if (part.name === 'upload' && part.filename && part.data?.length) {
      upload = { filename: part.filename, data: part.data, type: part.type }
    }
    else if (part.name && part.data) {
      fields[part.name] = part.data.toString('utf8').trim()
    }
  }
  const action = fields.action || 'apply'
  if (!(IMAGE_ACTIONS as readonly string[]).includes(action)) {
    throw apiError(event, 'VALIDATION_ERROR', 'That picture action is not available')
  }
  if (fields.illustration && !imageIllustrationSchema.safeParse(fields.illustration).success) {
    throw apiError(event, 'VALIDATION_ERROR', 'Choose one of the listed illustrations')
  }
  if (upload && upload.data.length > MAX_UPLOAD) {
    throw apiError(event, 'VALIDATION_ERROR', 'Choose a picture smaller than 2 MB')
  }
  const form = new FormData()
  form.append('action', action)
  if (fields.choice) form.append('choice', fields.choice)
  if (fields.illustration) form.append('illustration', fields.illustration)
  if (upload) {
    form.append('upload', new Blob([new Uint8Array(upload.data)], { type: upload.type || 'application/octet-stream' }), upload.filename)
  }
  try {
    return await engineJson<{ ok: true, notice?: string, preview?: boolean }>(`/api/printers/${params.queue}/image`, {
      method: 'POST',
      form,
      timeoutMs: 45_000,
    })
  }
  catch (err) {
    throw printApiError(event, err, 'Could not save the printer picture')
  }
})

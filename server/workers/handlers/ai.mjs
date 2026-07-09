// AI worker — service log extraction + invoice description (SPEC §10, P2-13/P2-14).
import { decryptBuffer } from '../lib/encryption.mjs'

const EXTRACTION_SYSTEM = `You extract structured service log data from photos of handwritten or printed shop notes.
Return JSON only with keys: complaint (customer symptoms, string or null), internalNotes (mechanic notes, string or null),
draftLineItems (array of {description, qty, rate, amount} — use plain numbers without currency symbols when possible).
If a field is not visible, use null or omit draftLineItems. Do not invent prices — leave rate/amount null if unclear.`

const DESCRIPTION_SYSTEM = `You rewrite mechanic line-item notes into clear, professional customer-facing invoice descriptions.
Return JSON only: { "description": "..." }.
Keep factual accuracy. Do not add parts, prices, quantities, or hours. Wording only — shorter is fine.`

function estimateCost(model, promptTokens, completionTokens) {
  const isHaiku = model.includes('haiku')
  const isSonnet = model.includes('sonnet') || model.includes('gpt-4')
  const promptRate = isHaiku ? 0.00000025 : isSonnet ? 0.000003 : 0.000001
  const completionRate = isHaiku ? 0.00000125 : isSonnet ? 0.000015 : 0.000003
  return Number(((promptTokens * promptRate) + (completionTokens * completionRate)).toFixed(6))
}

function parseJsonBlock(text) {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  }
  catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fence?.[1]) return JSON.parse(fence[1].trim())
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1))
    throw new Error('AI response was not valid JSON')
  }
}

async function loadAiSettings(pool) {
  const { rows } = await pool.query(`SELECT * FROM ai_provider_settings LIMIT 1`)
  const row = rows[0]
  if (!row?.encrypted_api_key || !row.enabled) {
    throw new Error('AI is not configured or disabled')
  }
  const apiKey = decryptBuffer(row.encrypted_api_key).toString('utf8')
  return {
    apiKey,
    defaultModel: row.default_model,
    serviceLogExtractionModel: row.service_log_extraction_model,
    invoiceDescriptionModel: row.invoice_description_model,
    serviceLogExtractionEnabled: row.service_log_extraction_enabled,
    invoiceDescriptionEnabled: row.invoice_description_enabled,
  }
}

function modelFor(settings, feature) {
  if (feature === 'service_log_extraction') {
    return settings.serviceLogExtractionModel ?? settings.defaultModel
  }
  if (feature === 'invoice_description') {
    return settings.invoiceDescriptionModel ?? settings.defaultModel
  }
  return settings.defaultModel
}

async function openRouterChat(apiKey, model, messages, temperature = 0.3) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL ?? 'http://localhost:3000',
      'X-Title': 'DORINC',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      response_format: { type: 'json_object' },
    }),
  })

  const payload = await res.json()
  if (!res.ok) {
    throw new Error(payload.error?.message ?? `OpenRouter returned ${res.status}`)
  }

  const content = payload.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('OpenRouter returned no content')

  const promptTokens = payload.usage?.prompt_tokens ?? 0
  const completionTokens = payload.usage?.completion_tokens ?? 0
  return {
    content,
    model,
    promptTokens,
    completionTokens,
    totalTokens: payload.usage?.total_tokens ?? (promptTokens + completionTokens),
    estimatedCostUsd: payload.usage?.cost ?? estimateCost(model, promptTokens, completionTokens),
  }
}

async function logUsage(pool, { aiJobId, featureType, model, promptTokens, completionTokens, totalTokens, estimatedCostUsd, createdBy }) {
  await pool.query(
    `INSERT INTO ai_usage_logs
      (ai_job_id, feature_type, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, provider, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'openrouter', $8)`,
    [aiJobId, featureType, model, promptTokens, completionTokens, totalTokens, String(estimatedCostUsd), createdBy],
  )
}

async function failAiJob(pool, aiJobId, message) {
  await pool.query(
    `UPDATE ai_jobs SET status = 'failed', last_error = $2, finished_at = now() WHERE id = $1`,
    [aiJobId, message],
  )
}

async function completeAiJob(pool, aiJobId, outputPayload) {
  await pool.query(
    `UPDATE ai_jobs SET status = 'done', output_payload = $2, finished_at = now(), last_error = NULL WHERE id = $1`,
    [aiJobId, JSON.stringify(outputPayload)],
  )
}

async function processExtraction(pool, aiJobId, settings) {
  if (!settings.serviceLogExtractionEnabled) throw new Error('Service log extraction is disabled')

  const { rows: jobRows } = await pool.query(`SELECT * FROM ai_jobs WHERE id = $1`, [aiJobId])
  const job = jobRows[0]
  if (!job) throw new Error('AI job not found')

  await pool.query(`UPDATE ai_jobs SET status = 'processing', started_at = now() WHERE id = $1`, [aiJobId])

  const input = job.input_payload
  const fileId = input.fileId
  const { rows: fileRows } = await pool.query(
    `SELECT mime_type, binary_data FROM app_files WHERE id = $1 AND archived_at IS NULL`,
    [fileId],
  )
  const file = fileRows[0]
  if (!file?.mime_type?.startsWith('image/')) throw new Error('Selected file is not an image')

  const dataUrl = `data:${file.mime_type};base64,${file.binary_data.toString('base64')}`
  const userText = [
    'Extract service log fields from this image.',
    input.complaint ? `Existing complaint (may refine): ${input.complaint}` : '',
    input.internalNotes ? `Existing internal notes (may refine): ${input.internalNotes}` : '',
  ].filter(Boolean).join('\n')

  const model = modelFor(settings, 'service_log_extraction')
  const result = await openRouterChat(settings.apiKey, model, [
    { role: 'system', content: EXTRACTION_SYSTEM },
    {
      role: 'user',
      content: [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ], 0.2)

  const parsed = { ...parseJsonBlock(result.content), fileId }

  const { rows: logRows } = await pool.query(
    `SELECT complaint, internal_notes, draft_line_items FROM service_logs WHERE id = $1`,
    [job.entity_id],
  )
  const log = logRows[0]

  const { rows: sugRows } = await pool.query(
    `INSERT INTO ai_suggestions
      (ai_job_id, feature_type, entity_type, entity_id, original_content, suggested_content, status)
     VALUES ($1, 'service_log_extraction', 'service_log', $2, $3, $4, 'pending')
     RETURNING id`,
    [
      aiJobId,
      job.entity_id,
      JSON.stringify({
        complaint: log?.complaint ?? null,
        internalNotes: log?.internal_notes ?? null,
        draftLineItems: log?.draft_line_items ?? null,
      }),
      JSON.stringify(parsed),
    ],
  )

  await logUsage(pool, {
    aiJobId,
    featureType: 'service_log_extraction',
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    totalTokens: result.totalTokens,
    estimatedCostUsd: result.estimatedCostUsd,
    createdBy: job.created_by,
  })

  await completeAiJob(pool, aiJobId, { suggestionId: sugRows[0].id })
}

async function processDescription(pool, aiJobId, settings) {
  if (!settings.invoiceDescriptionEnabled) throw new Error('Invoice description assist is disabled')

  const { rows: jobRows } = await pool.query(`SELECT * FROM ai_jobs WHERE id = $1`, [aiJobId])
  const job = jobRows[0]
  if (!job) throw new Error('AI job not found')

  await pool.query(`UPDATE ai_jobs SET status = 'processing', started_at = now() WHERE id = $1`, [aiJobId])

  const input = job.input_payload
  const userPrompt = [
    `Line type: ${input.lineType ?? 'labor'}`,
    `Original mechanic note: ${input.originalDescription ?? ''}`,
    input.complaint ? `Invoice complaint context: ${input.complaint}` : '',
    'Rewrite the mechanic note as a customer-facing invoice line description.',
  ].filter(Boolean).join('\n')

  const model = modelFor(settings, 'invoice_description')
  const result = await openRouterChat(settings.apiKey, model, [
    { role: 'system', content: DESCRIPTION_SYSTEM },
    { role: 'user', content: userPrompt },
  ], 0.4)

  const parsed = {
    ...parseJsonBlock(result.content),
    lineItemId: input.lineItemId,
    originalDescription: input.originalDescription,
  }

  const { rows: sugRows } = await pool.query(
    `INSERT INTO ai_suggestions
      (ai_job_id, feature_type, entity_type, entity_id, original_content, suggested_content, status)
     VALUES ($1, 'invoice_description', 'invoice', $2, $3, $4, 'pending')
     RETURNING id`,
    [
      aiJobId,
      job.entity_id,
      JSON.stringify({ description: input.originalDescription, lineItemId: input.lineItemId }),
      JSON.stringify(parsed),
    ],
  )

  await logUsage(pool, {
    aiJobId,
    featureType: 'invoice_description',
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    totalTokens: result.totalTokens,
    estimatedCostUsd: result.estimatedCostUsd,
    createdBy: job.created_by,
  })

  await completeAiJob(pool, aiJobId, { suggestionId: sugRows[0].id })
}

async function handleAiWorkerJob(pool, job) {
  const aiJobId = job.payload?.aiJobId
  if (!aiJobId) throw new Error('AI worker job missing aiJobId')

  const settings = await loadAiSettings(pool)

  if (job.job_type === 'service_log_ai_extraction') {
    await processExtraction(pool, aiJobId, settings)
    return
  }
  if (job.job_type === 'invoice_description_ai') {
    await processDescription(pool, aiJobId, settings)
    return
  }
  throw new Error(`Unknown AI worker job type: ${job.job_type}`)
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} [batch]
 */
export async function processAiJobs(pool, batch = 3) {
  let processed = 0
  let failed = 0

  for (let i = 0; i < batch; i++) {
    const client = await pool.connect()
    let job
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `SELECT id, job_type, payload, attempts, max_attempts FROM worker_jobs
         WHERE job_type IN ('service_log_ai_extraction', 'invoice_description_ai')
           AND status = 'queued' AND run_after <= now()
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      )
      job = rows[0]
      if (job) {
        await client.query(
          `UPDATE worker_jobs SET status = 'processing', attempts = attempts + 1, started_at = now() WHERE id = $1`,
          [job.id],
        )
      }
      await client.query('COMMIT')
    }
    catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    }
    finally {
      client.release()
    }

    if (!job) break

    try {
      await handleAiWorkerJob(pool, job)
      await pool.query(
        `UPDATE worker_jobs SET status = 'done', finished_at = now(), last_error = NULL WHERE id = $1`,
        [job.id],
      )
      processed++
    }
    catch (err) {
      failed++
      const message = err instanceof Error ? err.message : String(err)
      const aiJobId = job.payload?.aiJobId
      if (aiJobId) await failAiJob(pool, aiJobId, message).catch(() => {})

      const attempts = job.attempts + 1
      if (attempts >= job.max_attempts) {
        await pool.query(
          `UPDATE worker_jobs SET status = 'failed', finished_at = now(), last_error = $2 WHERE id = $1`,
          [job.id, message],
        )
      }
      else {
        await pool.query(
          `UPDATE worker_jobs SET status = 'queued', run_after = now() + make_interval(secs => $2), last_error = $3 WHERE id = $1`,
          [job.id, 30 * 2 ** (attempts - 1), message],
        )
      }
    }
  }

  return { processed, failed }
}

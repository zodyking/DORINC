import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { extname } from 'node:path'
import { and, eq, ne, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { printerDocuments, printerJobs } from '../../db/schema/printers'
import { PrintError } from './errors'

const FILE_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.txt': 'text/plain',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
}

export function fileTypeFor(filename: string): string {
  return FILE_TYPES[extname(filename || '').toLowerCase()] || 'application/octet-stream'
}

export function viewFilename(filename: string): string {
  const base = (filename || 'document').replace(/\.[A-Za-z0-9]{1,5}$/, '')
  return `${base || 'document'}.pdf`
}

/**
 * Keep one printable PDF per original file name and type. Printing the same
 * file again points the new job at the existing copy and refreshes its bytes.
 */
export async function storeDocument(
  db: Db,
  opts: { filename: string, pdf: Buffer, pages?: number | null },
): Promise<string> {
  const fileType = fileTypeFor(opts.filename)
  const [row] = await db.insert(printerDocuments).values({
    filename: opts.filename,
    fileType,
    pages: opts.pages ?? null,
    bytes: opts.pdf.length,
    data: opts.pdf,
  }).onConflictDoUpdate({
    target: [printerDocuments.filename, printerDocuments.fileType],
    set: {
      pages: opts.pages ?? null,
      bytes: opts.pdf.length,
      data: opts.pdf,
      updatedAt: new Date(),
    },
  }).returning({ id: printerDocuments.id })
  return row!.id
}

export async function documentData(db: Db, documentId: string | null): Promise<Buffer | null> {
  if (!documentId) return null
  const [row] = await db.select({ data: printerDocuments.data })
    .from(printerDocuments)
    .where(eq(printerDocuments.id, documentId))
    .limit(1)
  return row?.data ?? null
}

/** The PDF that was sent for a job, from the shared store or the job's own copy. */
export async function jobDocument(db: Db, jobId: string): Promise<{ filename: string, data: Buffer } | null> {
  const [job] = await db.select({
    filename: printerJobs.filename,
    filepath: printerJobs.filepath,
    fileData: printerJobs.fileData,
    documentId: printerJobs.documentId,
  }).from(printerJobs).where(eq(printerJobs.id, jobId)).limit(1)
  if (!job) return null
  const data = (await documentData(db, job.documentId))
    || job.fileData
    || (job.filepath && existsSync(job.filepath) ? readFileSync(job.filepath) : null)
  if (!data?.length) return null
  return { filename: viewFilename(job.filename), data }
}

/**
 * Remove a print history entry and the copy kept for the printer. Records the
 * file came from (invoices, service logs, email) are never touched.
 */
export async function deletePrinterJob(db: Db, jobId: string) {
  const [job] = await db.select({
    id: printerJobs.id,
    status: printerJobs.status,
    filepath: printerJobs.filepath,
    documentId: printerJobs.documentId,
  }).from(printerJobs).where(eq(printerJobs.id, jobId)).limit(1)
  if (!job) throw new PrintError('Job not found')
  if (job.status === 'sending' || job.status === 'preparing') {
    throw new PrintError('Wait for this job to finish sending before deleting it')
  }
  await db.delete(printerJobs).where(eq(printerJobs.id, jobId))
  if (job.filepath) {
    const [shared] = await db.select({ n: sql<number>`count(*)::int` })
      .from(printerJobs)
      .where(eq(printerJobs.filepath, job.filepath))
    if (!shared?.n) {
      try { unlinkSync(job.filepath) }
      catch { /* already gone */ }
    }
  }
  let removedDocument = false
  if (job.documentId) {
    const [others] = await db.select({ n: sql<number>`count(*)::int` })
      .from(printerJobs)
      .where(and(eq(printerJobs.documentId, job.documentId), ne(printerJobs.id, jobId)))
    if (!others?.n) {
      await db.delete(printerDocuments).where(eq(printerDocuments.id, job.documentId))
      removedDocument = true
    }
  }
  return { removedDocument }
}

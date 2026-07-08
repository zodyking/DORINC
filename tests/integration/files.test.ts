// Integration tests for app_files bytea storage (P1-13):
// upload validation (MIME allowlist, magic bytes, size), sha256, no blobs in lists, archive.
import { createHash } from 'node:crypto'
import { config } from 'dotenv'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import {
  archiveFile,
  FilesServiceError,
  getFileMeta,
  getFileWithData,
  listFilesByOwner,
  maxUploadBytes,
  sniffMime,
  uploadFile,
} from '../../server/services/files.service'
import { appFiles } from '../../server/db/schema/files'
import { users } from '../../server/db/schema/auth'
import { customers } from '../../server/db/schema/customers'
import { createCustomer } from '../../server/services/customers.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()

const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const CREATOR = anyUser!.id

// Files need an owning entity — use a scratch customer
const owner = await createCustomer(db, {
  displayName: `FileTest-${stamp} Co`,
  accountKind: 'individual',
}, CREATOR)

afterAll(async () => {
  await db.delete(appFiles).where(eq(appFiles.ownerEntityId, owner.id))
  await db.delete(customers).where(eq(customers.id, owner.id))
  await pool.end()
})

// Tiny valid 1x1 PNG
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'latin1')

function upload(extra: Partial<Parameters<typeof uploadFile>[1]> = {}) {
  return uploadFile(db, {
    ownerEntityType: 'customer',
    ownerEntityId: owner.id,
    fileKind: 'attachment',
    originalFilename: 'photo.png',
    mimeType: 'image/png',
    data: PNG_BYTES,
    ...extra,
  }, CREATOR)
}

describe('P1-13 app_files upload validation', () => {
  it('stores a valid PNG with sha256 + size and returns metadata only', async () => {
    const file = await upload()
    expect(file.sha256Hash).toBe(createHash('sha256').update(PNG_BYTES).digest('hex'))
    expect(file.fileSizeBytes).toBe(PNG_BYTES.length)
    expect(file.mimeType).toBe('image/png')
    expect('binaryData' in file).toBe(false)
  })

  it('accepts PDFs', async () => {
    const file = await upload({ originalFilename: 'doc.pdf', mimeType: 'application/pdf', data: PDF_BYTES, fileKind: 'pdf' })
    expect(file.mimeType).toBe('application/pdf')
  })

  it('rejects disallowed MIME types', async () => {
    await expect(upload({ mimeType: 'application/zip', originalFilename: 'x.zip' }))
      .rejects.toThrow(/not allowed/)
  })

  it('rejects content that does not match the declared MIME', async () => {
    // PDF bytes claiming to be a PNG
    await expect(upload({ data: PDF_BYTES }))
      .rejects.toThrow(/do not match/)
  })

  it('rejects empty and oversized files', async () => {
    await expect(upload({ data: Buffer.alloc(0) })).rejects.toThrow(/empty/i)

    const over = Buffer.alloc(maxUploadBytes() + 1)
    // Valid PNG magic so only the size check trips
    PNG_BYTES.copy(over, 0)
    await expect(upload({ data: over })).rejects.toThrow(/upload limit/)
  })

  it('sniffs magic bytes correctly', () => {
    expect(sniffMime(PNG_BYTES)).toBe('image/png')
    expect(sniffMime(PDF_BYTES)).toBe('application/pdf')
    expect(sniffMime(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]))).toBe('image/jpeg')
    expect(sniffMime(Buffer.from('garbage data here'))).toBeNull()
  })
})

describe('P1-13 app_files reads + archive', () => {
  it('round-trips the exact bytes', async () => {
    const file = await upload()
    const full = await getFileWithData(db, file.id)
    expect(Buffer.compare(full.binaryData, PNG_BYTES)).toBe(0)
  })

  it('list queries never include the blob column', async () => {
    await upload()
    const items = await listFilesByOwner(db, { ownerEntityType: 'customer', ownerEntityId: owner.id })
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect('binaryData' in item).toBe(false)
      expect(item.sha256Hash).toMatch(/^[a-f0-9]{64}$/)
    }
  })

  it('archives instead of deleting; archived hidden from default lists', async () => {
    const file = await upload()
    const archived = await archiveFile(db, file.id)
    expect(archived.archivedAt).toBeTruthy()

    await expect(archiveFile(db, file.id)).rejects.toThrow('ALREADY_ARCHIVED')

    const visible = await listFilesByOwner(db, { ownerEntityType: 'customer', ownerEntityId: owner.id })
    expect(visible.map(f => f.id)).not.toContain(file.id)

    const all = await listFilesByOwner(db, { ownerEntityType: 'customer', ownerEntityId: owner.id, includeArchived: true })
    expect(all.map(f => f.id)).toContain(file.id)

    // Row still exists with data intact
    const meta = await getFileMeta(db, file.id)
    expect(meta.archivedAt).toBeTruthy()
  })

  it('throws NOT_FOUND for missing ids', async () => {
    await expect(getFileMeta(db, '00000000-0000-0000-0000-000000000000'))
      .rejects.toThrow(FilesServiceError)
  })
})

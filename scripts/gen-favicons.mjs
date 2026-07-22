// Regenerate transparent favicon + touch/OG icons from the brand mark.
// Source: public/images/dorinc-icon-trans.png — a genuinely transparent (RGBA)
// master with the white background keyed out. `fit: contain` only pads, it does
// NOT remove a baked-in background, so the source MUST already be transparent.
// Run: node scripts/gen-favicons.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'public/images/dorinc-icon-trans.png')
const PUBLIC = join(root, 'public')

/** Render the source mark to a square transparent PNG buffer of the given size. */
async function pngAt(size) {
  return sharp(await readFile(SRC))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

/** Pack an array of {size, buffer} PNGs into a single multi-resolution .ico file. */
function buildIco(entries) {
  const count = entries.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(count, 4)

  const dir = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  const blobs = []
  entries.forEach((entry, i) => {
    const base = i * 16
    dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 0) // width
    dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 1) // height
    dir.writeUInt8(0, base + 2) // palette
    dir.writeUInt8(0, base + 3) // reserved
    dir.writeUInt16LE(1, base + 4) // color planes
    dir.writeUInt16LE(32, base + 6) // bits per pixel
    dir.writeUInt32LE(entry.buffer.length, base + 8) // size of image data
    dir.writeUInt32LE(offset, base + 12) // offset of image data
    offset += entry.buffer.length
    blobs.push(entry.buffer)
  })

  return Buffer.concat([header, dir, ...blobs])
}

const sizes = [16, 32, 48, 64]
const pngs = await Promise.all(sizes.map(async size => ({ size, buffer: await pngAt(size) })))

await writeFile(join(PUBLIC, 'favicon.ico'), buildIco(pngs))
await writeFile(join(PUBLIC, 'favicon-32.png'), pngs.find(p => p.size === 32).buffer)
await writeFile(join(PUBLIC, 'favicon-16.png'), pngs.find(p => p.size === 16).buffer)
await writeFile(join(PUBLIC, 'apple-touch-icon.png'), await pngAt(180))

console.log('Wrote transparent favicon.ico, favicon-16.png, favicon-32.png, apple-touch-icon.png')

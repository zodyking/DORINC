import fs from 'node:fs'
import path from 'node:path'

const root = 'server/api'
const serverMods = ['db', 'utils', 'services', 'auth']

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, files)
    else if (ent.name.endsWith('.ts')) files.push(p)
  }
  return files
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const fixed = []
for (const file of walk(root)) {
  const rel = file.replace(/\\/g, '/')
  const afterApi = rel.slice('server/api/'.length)
  const depth = afterApi.split('/').length - 1
  const serverPrefix = '../'.repeat(depth + 1)
  const sharedPrefix = '../'.repeat(depth + 2)

  let text = fs.readFileSync(file, 'utf8')
  const orig = text

  for (const mod of serverMods) {
    const re = new RegExp(`from (['"])\\.\\.\\/+(?:\\.\\.\\/)*${escapeRegExp(mod)}\\/`, 'g')
    text = text.replace(re, `from $1${serverPrefix}${mod}/`)
  }

  {
    const re = new RegExp(`from (['"])\\.\\.\\/+(?:\\.\\.\\/)*shared\\/`, 'g')
    text = text.replace(re, `from $1${sharedPrefix}shared/`)
  }

  if (text !== orig) {
    fs.writeFileSync(file, text)
    fixed.push(rel)
  }
}

console.log(`Fixed ${fixed.length} files`)
for (const f of fixed) console.log(f)

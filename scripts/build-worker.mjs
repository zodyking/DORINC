// Copies worker entry points into .worker-dist for the worker/pdf-worker images.
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const out = join(root, '.worker-dist')

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
cpSync(join(root, 'server', 'workers'), out, { recursive: true })

console.log(`[build:worker] copied server/workers -> .worker-dist`)  

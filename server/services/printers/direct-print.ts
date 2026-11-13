import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { buildIppPrintJob, ippStatusCode, ippSucceeded, parseIpp } from '../../../shared/printers'
import { PrintError } from './errors'
import { localForward, openTcp } from './tailnet'
import type { CupsResult } from './cups'

async function readSocket(sock: import('node:net').Socket, limit = 400000): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    const done = () => resolve(Buffer.concat(chunks))
    sock.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      chunks.push(buf)
      total += buf.length
      if (total >= limit) {
        sock.destroy()
        done()
      }
    })
    sock.on('end', done)
    sock.on('error', reject)
    sock.setTimeout(20000, () => {
      sock.destroy()
      done()
    })
  })
}

async function sendIppJob(connectHost: string, connectPort: number, printerUri: string, copies: number, sides: string, path: string): Promise<CupsResult> {
  const document = readFileSync(path)
  const body = buildIppPrintJob({
    printerUri,
    jobName: basename(path),
    copies,
    sides,
    document,
  })
  const http = Buffer.concat([
    Buffer.from(
      `POST /ipp/print HTTP/1.1\r\nHost: ${connectHost}:${connectPort}\r\nContent-Type: application/ipp\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`,
      'ascii',
    ),
    body,
  ])
  let lastError = 'The printer did not accept the IPP job'
  for (const payload of [http, body]) {
    try {
      const sock = await openTcp(connectHost, connectPort, 8)
      sock.write(payload)
      const reply = await readSocket(sock)
      sock.destroy()
      const status = ippStatusCode(reply)
      if (!ippSucceeded(status)) {
        lastError = `IPP print failed (${status ?? 'no response'})`
        continue
      }
      const attrs = parseIpp(reply)
      const jobId = attrs['job-id']?.[0]
      const requestId = typeof jobId === 'number' ? `ipp-${jobId}` : 'ipp'
      return { returncode: 0, stdout: `request id is ${requestId}`, stderr: '' }
    }
    catch (err) {
      lastError = String(err instanceof Error ? err.message : err).slice(0, 200)
    }
  }
  throw new PrintError(lastError)
}

async function sendRaw9100(connectHost: string, connectPort: number, path: string): Promise<CupsResult> {
  const document = readFileSync(path)
  const sock = await openTcp(connectHost, connectPort, 8)
  await new Promise<void>((resolve, reject) => {
    sock.once('error', reject)
    sock.write(document, (err) => {
      if (err) reject(err)
      else {
        sock.end()
        resolve()
      }
    })
  })
  sock.destroy()
  return { returncode: 0, stdout: 'request id is direct-9100', stderr: '' }
}

/** Send a prepared PDF when this host has no CUPS (`lp`). Uses IPP, then port 9100. */
export async function sendDirectToPrinter(input: {
  queue: string
  host: string
  protocol: string
  copies: number
  sides: string
  path: string
}): Promise<CupsResult> {
  const address = input.host
  const ippForward = await localForward(input.queue, address, 631).catch(() => 0)
  const rawForward = await localForward(input.queue, address, 9100).catch(() => 0)
  const errors: string[] = []

  const ippHost = ippForward ? '127.0.0.1' : address
  const ippPort = ippForward || 631
  try {
    return await sendIppJob(ippHost, ippPort, `ipp://${address}/ipp/print`, input.copies, input.sides, input.path)
  }
  catch (err) {
    errors.push(String(err instanceof Error ? err.message : err))
  }

  const rawHost = rawForward ? '127.0.0.1' : address
  const rawPort = rawForward || 9100
  try {
    return await sendRaw9100(rawHost, rawPort, input.path)
  }
  catch (err) {
    errors.push(String(err instanceof Error ? err.message : err))
  }

  throw new PrintError(
    `Could not send the job to the printer over IPP or port 9100. ${errors.filter(Boolean).join(' ')}`.slice(0, 400),
  )
}

// Exercise the complete validator through a temporary route in the actual local OpenNext Worker.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { deflateSync } from 'node:zlib'
import { makeBoundaryFixtures } from './profile-photo-boundary-fixtures.mjs'
import { assertPortAvailable, waitForProbeNonce, withOwnedProcess } from './profile-photo-worker-process.mjs'

const root = resolve(import.meta.dirname, '..')
const boundary = process.argv.includes('--boundary')
const portOption = process.argv.find(arg => arg.startsWith('--port='))
const port = portOption ? Number(portOption.slice('--port='.length)) : 8787
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid selected preview port')
if (process.argv.slice(2).some(arg => arg !== '--boundary' && !arg.startsWith('--port='))) throw new Error('Unknown probe argument')
const nonce = randomUUID()
const deadline = AbortSignal.timeout(8 * 60_000)
const interrupted = new AbortController()
const onSignal = signal => interrupted.abort(new Error(`Interrupted by ${signal}`))
const onInt = () => onSignal('SIGINT')
const onTerm = () => onSignal('SIGTERM')
process.on('SIGINT', onInt)
process.on('SIGTERM', onTerm)
function checkInterrupted() {
  if (interrupted.signal.aborted) throw interrupted.signal.reason
  if (deadline.aborted) throw new Error('Local Worker probe exceeded overall timeout')
}
const routeDir = resolve(root, 'app/api/local-profile-photo-probe')
if (existsSync(routeDir)) throw new Error('Refusing to overwrite an existing probe route')
// Next and Wrangler can load local dotenv files independently of the child process environment.
const localEnvFiles = readdirSync(root).filter(name => name.startsWith('.env') || name.startsWith('.dev.vars'))
if (localEnvFiles.length) throw new Error(`Refusing local check while project dotenv files exist: ${localEnvFiles.join(', ')}`)
const route = `import { validateProfilePhoto, ProfilePhotoError } from '@/lib/server/profile-photo'
// This route exists only during the local check and never connects to authentication or storage.
const nonce = ${JSON.stringify(nonce)}
export async function GET() { return Response.json({ nonce }) }
export async function POST(request: Request) {
  const start = performance.now()
  try {
    const result = await validateProfilePhoto(request)
    return Response.json({ nonce, width: result.width, height: result.height, contentType: result.contentType, length: result.bytes.length, wallMs: performance.now() - start })
  } catch (error) {
    if (error instanceof ProfilePhotoError) return Response.json({ nonce, code: error.code, wallMs: performance.now() - start }, { status: error.status })
    return Response.json({ nonce, code: 'unexpected' }, { status: 500 })
  }
}`

function run(command, args, env, signals = [interrupted.signal, deadline]) {
  return withOwnedProcess(command, args, { cwd: root, env, stdio: 'inherit' }, child => new Promise((resolveRun, reject) => {
    for (const signal of signals) signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`${command} exited ${code}`)))
  }))
}
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(name, data) {
  const bytes = new Uint8Array(data.length + 12)
  new DataView(bytes.buffer).setUint32(0, data.length)
  bytes.set(new TextEncoder().encode(name), 4)
  bytes.set(data, 8)
  new DataView(bytes.buffer).setUint32(data.length + 8, crc32(bytes.subarray(4, data.length + 8)))
  return bytes
}
function splitPng(bytes) {
  const parts = []
  for (let offset = 8; offset < bytes.length;) {
    const end = offset + 12 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset)
    parts.push(bytes.subarray(offset, end))
    offset = end
  }
  return parts
}
function makePng(signature, parts) { return new Uint8Array([...signature.subarray(0, 8), ...parts.flatMap(part => [...part])]) }
function mutatePngHeader(bytes, change) {
  const copy = bytes.slice()
  change(copy)
  new DataView(copy.buffer).setUint32(29, crc32(copy.subarray(12, 29)))
  return copy
}

function prematureJpegScan(bytes) {
  let offset = 2
  while (offset < bytes.length) {
    const marker = bytes[offset + 1]
    const length = bytes[offset + 2] * 256 + bytes[offset + 3]
    if (marker === 0xda) return new Uint8Array([...bytes.subarray(0, offset + 2 + length + 1), 0xff, 0xd9])
    offset += 2 + length
  }
  throw new Error('Synthetic JPEG fixture has no scan')
}

// A temporary HOME and narrow child environment prevent inherited provider credentials from entering the build/preview.
const tempHome = mkdtempSync(join(tmpdir(), 'ante-photo-worker-'))
const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: tempHome, TMPDIR: tmpdir(), CI: '1', NEXT_TELEMETRY_DISABLED: '1', WRANGLER_SEND_METRICS: 'false', NEXT_PUBLIC_SUPABASE_URL: 'https://localhost.invalid', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public-key', NEXT_PUBLIC_ANTE_SITE_ORIGIN: `http://localhost:${port}` }
const fixture = name => new Uint8Array(readFileSync(resolve(root, 'tests/fixtures', name)))
const png = fixture('red-2x2.png')
const jpeg = fixture('red-2x2.jpg')
const [ihdr, , idat, iend] = splitPng(png)
let buildSucceeded = false
try {
  await assertPortAvailable(port)
  checkInterrupted()
  // Construct and independently JPEG-decode the corpus before a Worker process can return a status.
  const boundaryFixtures = boundary ? await makeBoundaryFixtures() : undefined
  mkdirSync(routeDir, { recursive: true })
  writeFileSync(resolve(routeDir, 'route.ts'), route)
  await run('pnpm', ['run', 'build:worker'], env)
  buildSucceeded = true
  const url = `http://127.0.0.1:${port}/api/local-profile-photo-probe`
  async function check(name, bytes, mime, expected) {
    checkInterrupted()
    const started = performance.now()
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': mime }, body: bytes, signal: AbortSignal.any([interrupted.signal, deadline]) })
    const result = await response.json()
    const receipt = { name, status: response.status, ...result, clientWallMs: +(performance.now() - started).toFixed(1), label: 'local Worker screening only; wall time is not CPU or peak isolate memory' }
    if (boundary) { receipt.sha256 = createHash('sha256').update(bytes).digest('hex'); receipt.bytes = bytes.byteLength }
    console.log(JSON.stringify(receipt))
    if (result.nonce !== nonce) throw new Error(`${name}: response came from another preview run`)
    if (!(Array.isArray(expected) ? expected.includes(response.status) : response.status === expected)) throw new Error(`${name}: expected ${expected}, received ${response.status}`)
    return { ...result, status: response.status }
  }
  await withOwnedProcess('pnpm', ['run', 'preview:worker', '--port', String(port)], { cwd: root, env, stdio: 'inherit' }, async () => {
    await waitForProbeNonce(url, nonce, { timeoutMs: 30_000, signal: interrupted.signal })
    checkInterrupted()
    if (boundary) {
      const valid = boundaryFixtures.find(item => item.name === 'png_rgba8_max')
      for (const item of boundaryFixtures) {
        const result = await check(item.name, item.bytes, item.mime, item.expectedStatus)
        if (item.expectedStatus === 200 && (result.width !== item.width || result.height !== item.height || result.length !== item.bytes.byteLength || result.contentType !== item.mime)) throw new Error(`${item.name}: returned image dimensions, type or length differ`)
        if (item.expectedStatus !== 200) {
          const recovery = await check(`${item.name}_recovery`, valid.bytes, valid.mime, 200)
          if (recovery.width !== valid.width || recovery.height !== valid.height || recovery.length !== valid.bytes.byteLength) throw new Error(`${item.name}: valid recovery dimensions or length differ`)
        }
      }
      for (const name of ['png_rgba16_max', 'jpeg_progressive_max']) {
        const item = boundaryFixtures.find(fixture => fixture.name === name)
        for (let attempt = 1; attempt <= 3; attempt++) {
          const result = await check(`${name}_warm_${attempt}`, item.bytes, item.mime, 200)
          if (result.width !== item.width || result.height !== item.height || result.length !== item.bytes.byteLength) throw new Error(`${name}: warm returned dimensions or length differ`)
        }
      }
      return
    }
  await check('valid_png', png, 'image/png', 200)
  await check('empty_idat', makePng(png, [ihdr, idat, chunk('IDAT', new Uint8Array()), iend]), 'image/png', 200)
  await check('valid_jpeg', jpeg, 'image/jpeg', 200)
  await check('progressive_jpeg', fixture('red-2x2-progressive.jpg'), 'image/jpeg', 200)
  await check('wide_png', fixture('red-2048x2.png'), 'image/png', 200)
  await check('wide_jpeg', fixture('red-2048x2.jpg'), 'image/jpeg', 200)
  await check('mime_mismatch', png, 'image/jpeg', 422)
  const badCrc = png.slice(); badCrc[badCrc.length - 1] ^= 1
  await check('bad_crc', badCrc, 'image/png', 422)
  await check('invalid_idat', makePng(png, [ihdr, chunk('IDAT', deflateSync(new Uint8Array([5, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0, 0]))), iend]), 'image/png', 422)
  await check('inflation_overflow', makePng(png, [ihdr, chunk('IDAT', deflateSync(new Uint8Array(100_000))), iend]), 'image/png', 422)
  await check('apng', makePng(png, [ihdr, chunk('acTL', new Uint8Array(8)), idat, iend]), 'image/png', 415)
  await check('interlaced', mutatePngHeader(png, bytes => { bytes[28] = 1 }), 'image/png', 415)
  await check('oversize_axis', mutatePngHeader(png, bytes => { new DataView(bytes.buffer).setUint32(16, 2049) }), 'image/png', 422)
  await check('overlong_chunk', makePng(png, [ihdr, (() => { const copy = idat.slice(); new DataView(copy.buffer).setUint32(0, 0x7fffffff); return copy })(), iend]), 'image/png', 422)
  await check('trailing_png', new Uint8Array([...png, 0]), 'image/png', 422)
  await check('truncated_jpeg', jpeg.slice(0, -2), 'image/jpeg', 422)
  await check('premature_scan_jpeg', prematureJpegScan(fixture('red-2048x2.jpg')), 'image/jpeg', 422)
  await check('jpeg_recovery_after_warning', jpeg, 'image/jpeg', 200)
  await check('multi_jpeg', new Uint8Array([...jpeg, ...jpeg]), 'image/jpeg', 422)
  const oversized = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2_097_152)); controller.enqueue(new Uint8Array(1)); controller.close() } })
  const overResponse = await fetch(url, { method: 'POST', headers: { 'content-type': 'image/png' }, body: oversized, duplex: 'half' })
  console.log(JSON.stringify({ name: 'chunked_over_cap', status: overResponse.status, ...await overResponse.json() }))
  if (overResponse.status !== 413) throw new Error('Streaming cap was bypassed')
  const concurrent = await Promise.all(Array.from({ length: 4 }, (_, index) => check(`concurrent_${index}`, png, 'image/png', [200, 503])))
  if (!concurrent.some(result => result.status === 200) || concurrent.some(result => result.status === 200 && result.width !== 2)) throw new Error('Concurrent batch lost a valid result')
  await check('same_isolate_recovery', jpeg, 'image/jpeg', 200)
  })
} finally {
  rmSync(routeDir, { recursive: true, force: true })
  // Regenerate artifacts without the temporary route even when a probe assertion fails.
  try { if (buildSucceeded) await run('pnpm', ['run', 'build:worker'], env, [AbortSignal.timeout(120_000)]) }
  finally {
    rmSync(tempHome, { recursive: true, force: true })
    process.off('SIGINT', onInt)
    process.off('SIGTERM', onTerm)
  }
}

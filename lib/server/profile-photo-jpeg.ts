// JPEG preflight walks every marker and entropy scan so a valid header alone cannot admit a truncated image.
import { ProfilePhotoError } from './profile-photo-error'
import type { ImageDimensions } from './profile-photo-png'

function invalid(): never { throw new ProfilePhotoError('invalid_image', 422) }
function unsupported(): never { throw new ProfilePhotoError('unsupported_format', 415) }

export function inspectJpeg(bytes: Uint8Array): ImageDimensions {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) invalid()
  let offset = 2
  let markers = 0
  let width = 0
  let height = 0
  let seenFrame = false
  let seenScan = false
  let scanBytes = 0
  let inScan = false

  while (offset < bytes.length) {
    if (++markers > 4096) invalid()
    if (inScan) {
      // Entropy-coded FF00 bytes are escaped data; restart markers do not end a scan.
      while (offset < bytes.length) {
        if (bytes[offset++] !== 0xff) { scanBytes++; continue }
        const markerStart = offset - 1
        while (offset < bytes.length && bytes[offset] === 0xff) offset++
        if (offset >= bytes.length) invalid()
        const code = bytes[offset]
        if (code === 0x00) { offset++; scanBytes++; continue }
        if (code >= 0xd0 && code <= 0xd7) { offset++; continue }
        offset = markerStart
        inScan = false
        break
      }
      if (inScan) invalid()
    }
    if (offset >= bytes.length || bytes[offset++] !== 0xff) invalid()
    while (offset < bytes.length && bytes[offset] === 0xff) offset++
    if (offset >= bytes.length) invalid()
    const marker = bytes[offset++]
    if (marker === 0xd9) {
      if (!seenFrame || !seenScan || scanBytes === 0 || offset !== bytes.length) invalid()
      return { width, height }
    }
    if (marker === 0xd8 || marker === 0x00 || marker >= 0xd0 && marker <= 0xd7 || marker === 0x01) invalid()
    if (offset + 2 > bytes.length) invalid()
    const length = bytes[offset] * 256 + bytes[offset + 1]
    if (length < 2 || length > bytes.length - offset) invalid()
    const end = offset + length
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (![0xc0, 0xc2].includes(marker)) unsupported()
      if (seenFrame || length < 8) invalid()
      const components = bytes[offset + 7]
      if (![1, 3, 4].includes(components) || length !== 8 + components * 3 || bytes[offset + 2] !== 8) invalid()
      height = bytes[offset + 3] * 256 + bytes[offset + 4]
      width = bytes[offset + 5] * 256 + bytes[offset + 6]
      if (width < 1 || height < 1 || width > 2048 || height > 2048 || width * height > 4_000_000) invalid()
      seenFrame = true
    }
    if (marker === 0xda) {
      if (!seenFrame || length < 6) invalid()
      const components = bytes[offset + 2]
      if (components < 1 || components > 4 || length !== 6 + components * 2) invalid()
      seenScan = true
      inScan = true
    }
    // DNL changes frame height after preflight, and arithmetic coding is not in the accepted profile.
    if (marker === 0xdc || marker === 0xcc) unsupported()
    offset = end
  }
  return invalid()
}

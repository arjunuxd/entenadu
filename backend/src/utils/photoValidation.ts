export const MAX_PHOTO_BYTES = 10 * 1024 * 1024

export type PhotoValidationError = 'empty' | 'too_large' | 'unsupported_type'

export type PhotoValidationResult =
  | { ok: true; mimeType: string }
  | { ok: false; reason: PhotoValidationError }

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]

export function sniffMimeType(buffer: Buffer): string | null {
  if (buffer.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, index) => buffer[index] === byte)) {
    return 'image/png'
  }

  if (buffer.length >= JPEG_SIGNATURE.length && JPEG_SIGNATURE.every((byte, index) => buffer[index] === byte)) {
    return 'image/jpeg'
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }

  return null
}

export function validatePhoto(buffer: Buffer): PhotoValidationResult {
  if (!buffer || buffer.length === 0) {
    return { ok: false, reason: 'empty' }
  }

  if (buffer.length > MAX_PHOTO_BYTES) {
    return { ok: false, reason: 'too_large' }
  }

  const mimeType = sniffMimeType(buffer)

  if (mimeType === null) {
    return { ok: false, reason: 'unsupported_type' }
  }

  return { ok: true, mimeType }
}
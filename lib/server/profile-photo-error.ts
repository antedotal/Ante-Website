// Public callers receive only fixed error codes and statuses, never decoder or uploaded-byte details.
export type ProfilePhotoErrorCode = 'invalid_input' | 'unsupported_format' | 'too_large' | 'invalid_image' | 'timed_out' | 'decoder_unavailable'

export class ProfilePhotoError extends Error {
  constructor(public readonly code: ProfilePhotoErrorCode, public readonly status: 400 | 408 | 413 | 415 | 422 | 503) {
    super(code)
    this.name = 'ProfilePhotoError'
  }
}

/**
 * Request schema for POST /api/ocr.
 *
 * Every byte crossing the trust boundary is checked here, before any business
 * logic runs: exact field set (unknown fields are rejected, not ignored), media
 * type allowlist, base64 shape, and a hard decoded-size cap.
 *
 * Files under api/_lib are helpers, not routes — Vercel ignores paths whose
 * segment starts with an underscore.
 */

/** Decoded image bytes. The client downscales to ~2000px, which lands well under this. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** Formats Claude accepts as image input. Never trust a client-declared type beyond this list. */
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const ALLOWED_FIELDS = ['image', 'mediaType'];

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * @param {unknown} raw - the parsed request body
 * @returns {{ ok: true, value: { image: string, mediaType: string } }
 *          | { ok: false, status: number, message: string }}
 */
function validateOcrRequest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, status: 400, message: 'Request body must be a JSON object.' };
  }

  const unknown = Object.keys(raw).filter((key) => !ALLOWED_FIELDS.includes(key));
  if (unknown.length > 0) {
    return { ok: false, status: 400, message: `Unexpected field(s): ${unknown.join(', ')}.` };
  }

  const { image, mediaType } = raw;

  if (typeof mediaType !== 'string' || !ALLOWED_MEDIA_TYPES.includes(mediaType)) {
    return {
      ok: false,
      status: 400,
      message: `mediaType must be one of: ${ALLOWED_MEDIA_TYPES.join(', ')}.`,
    };
  }

  if (typeof image !== 'string' || image.length === 0) {
    return { ok: false, status: 400, message: 'image must be a base64 string.' };
  }

  // Reject data: URL prefixes — the client strips them, so their presence means
  // the payload is not the shape this endpoint contracted for.
  if (!BASE64_PATTERN.test(image)) {
    return { ok: false, status: 400, message: 'image must be raw base64 with no data: prefix.' };
  }

  // 4 base64 chars encode 3 bytes; padding trims 1 or 2 from the total.
  const padding = image.endsWith('==') ? 2 : image.endsWith('=') ? 1 : 0;
  const decodedBytes = (image.length / 4) * 3 - padding;

  if (!Number.isFinite(decodedBytes) || decodedBytes <= 0) {
    return { ok: false, status: 400, message: 'image is not valid base64.' };
  }

  if (decodedBytes > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      status: 413,
      message: `Image is too large (max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB).`,
    };
  }

  return { ok: true, value: { image, mediaType } };
}

module.exports = { validateOcrRequest, MAX_IMAGE_BYTES, ALLOWED_MEDIA_TYPES };

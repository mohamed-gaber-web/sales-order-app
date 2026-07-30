/**
 * Vercel serverless function: POST /api/ocr
 *
 * Reads a photographed purchase order and returns it as structured JSON. The
 * Anthropic API key is injected server-side from the ANTHROPIC_API_KEY
 * environment variable — it never reaches the browser bundle.
 *
 * Locally, `npm run dev:api` serves this same handler on port 3001 and
 * proxy.conf.js points /api/ocr at it.
 *
 * Required environment variable:
 *   ANTHROPIC_API_KEY — an Anthropic API key with access to claude-opus-5
 */

const { validateOcrRequest } = require('./_lib/ocr-request');
const { checkRateLimit } = require('./_lib/rate-limit');
const { extractPurchaseOrder, ExtractionError } = require('./_lib/po-extraction.service');

/** Client-safe copy for each failure the extraction service can raise. */
const EXTRACTION_ERROR_RESPONSES = {
  not_configured: { status: 503, message: 'Document scanning is not configured on the server.' },
  refused: { status: 422, message: 'This document could not be read. Try a clearer photo.' },
  truncated: { status: 422, message: 'This document has too many lines to read in one photo. Try one page at a time.' },
  empty_response: { status: 502, message: 'No data came back from the reader. Try again.' },
  unparseable_response: { status: 502, message: 'The reader returned an unexpected result. Try again.' },
};

/** Vercel usually hands back a parsed object; the local dev host passes a raw string. */
function readBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req.body ?? null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const limit = checkRateLimit(req);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many scans. Wait a moment and try again.' });
  }

  const validation = validateOcrRequest(readBody(req));
  if (!validation.ok) {
    return res.status(validation.status).json({ error: validation.message });
  }

  try {
    const extraction = await extractPurchaseOrder(validation.value);
    return res.status(200).json(extraction);
  } catch (err) {
    if (err instanceof ExtractionError) {
      const mapped = EXTRACTION_ERROR_RESPONSES[err.code];
      // Log the real reason server-side; hand the client the safe version.
      console.error(`[api/ocr] extraction failed (${err.code}):`, err.message);
      return res
        .status(mapped?.status ?? 502)
        .json({ error: mapped?.message ?? 'Could not read this document. Try again.' });
    }

    // Upstream/network failure. Never surface the provider's message or stack.
    console.error('[api/ocr] Unexpected error:', err);
    const status = err?.status === 429 ? 429 : 502;
    return res.status(status).json({
      error:
        status === 429
          ? 'The document reader is busy. Wait a moment and try again.'
          : 'Could not reach the document reader. Check your connection and try again.',
    });
  }
};

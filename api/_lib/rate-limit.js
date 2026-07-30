/**
 * Best-effort per-IP throttle for the OCR endpoint.
 *
 * LIMITATION — read before relying on this: the counter lives in the function
 * instance's memory. It holds across requests served by the same warm instance
 * and resets when the platform spins up a new one, so it caps casual abuse and
 * runaway retry loops, not a distributed attacker. Move the counter to a shared
 * store (or put a WAF rule in front of /api/ocr) before this endpoint is exposed
 * to untrusted traffic — every allowed request costs a model call.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;

/** @type {Map<string, number[]>} client key -> request timestamps inside the window */
const hits = new Map();

/**
 * Resolves the real client IP. Behind Vercel's proxy the socket address is the
 * proxy's, so the forwarded header is the only usable key.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) {
    return realIp;
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

/**
 * @param {import('http').IncomingMessage} req
 * @returns {{ allowed: boolean, retryAfterSeconds: number }}
 */
function checkRateLimit(req) {
  const key = clientKey(req);
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const recent = (hits.get(key) ?? []).filter((at) => at > windowStart);

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    hits.set(key, recent);
    const retryAfterSeconds = Math.ceil((recent[0] + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  }

  recent.push(now);
  hits.set(key, recent);

  // Keep the map from growing without bound on a long-lived instance.
  if (hits.size > 500) {
    for (const [otherKey, timestamps] of hits) {
      if (timestamps.every((at) => at <= windowStart)) hits.delete(otherKey);
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

module.exports = { checkRateLimit, MAX_REQUESTS_PER_WINDOW, WINDOW_MS };

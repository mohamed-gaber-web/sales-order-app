/**
 * Vercel serverless function: proxy to D365.
 *
 * vercel.json rewrites /data/* and /api/services/* here, passing the real
 * upstream path in the `dpath` query parameter (?dpath=/data/...).
 *
 * A filesystem catch-all route (api/d365/[...path].js) was tried first, but
 * on this project Vercel's zero-config routing only matched a single path
 * segment for it — /api/d365/x worked, /api/d365/data/SalesOrderHeadersV3
 * 404'd before the function was ever invoked. Rewriting to this fixed path
 * with the target encoded in a query param sidesteps that limitation.
 */

const D365_BASE = 'https://growpath.sandbox.operations.eu.dynamics.com';
const FORWARDED_HEADERS = ['authorization', 'content-type', 'accept', 'if-match', 'prefer'];

module.exports = async function handler(req, res) {
  const { dpath, ...rest } = req.query || {};
  if (!dpath) {
    return res.status(400).json({ error: 'Missing dpath query parameter' });
  }

  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    if (Array.isArray(value)) {
      value.forEach((v) => qs.append(key, v));
    } else if (value !== undefined) {
      qs.append(key, value);
    }
  }
  const query = qs.toString();
  const url = D365_BASE + dpath + (query ? `?${query}` : '');

  const headers = {};
  for (const name of FORWARDED_HEADERS) {
    if (req.headers[name]) headers[name] = req.headers[name];
  }

  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body != null) {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  try {
    const upstream = await fetch(url, init);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    const etag = upstream.headers.get('etag');
    if (etag) res.setHeader('ETag', etag);

    const text = await upstream.text();
    res.status(upstream.status).send(text);
  } catch (err) {
    console.error('[api/d365] Proxy error:', err);
    res.status(502).json({ error: 'D365 proxy error', detail: err.message });
  }
};

/**
 * Vercel serverless function: catch-all proxy to D365.
 *
 * Handles /data/* (OData) and /api/services/* (custom services) on web.
 * A plain vercel.json external rewrite cannot be used because Vercel keeps
 * the original Host header (<app>.vercel.app), and D365 routes by hostname
 * and answers 404. This function forwards the request with the correct host.
 */

const D365_BASE = 'https://growpath.sandbox.operations.eu.dynamics.com';

const FORWARDED_HEADERS = ['authorization', 'content-type', 'accept', 'if-match', 'prefer'];

module.exports = async function handler(req, res) {
  // req.url is either the rewritten path (/api/d365/data/...) or the
  // original one (/data/... or /api/services/...) — both map onto D365 as-is.
  const targetPath = req.url.replace(/^\/api\/d365/, '');
  const url = D365_BASE + targetPath;

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

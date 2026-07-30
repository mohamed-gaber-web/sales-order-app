/**
 * Local host for the /api serverless functions.
 *
 * `ng serve` cannot execute Vercel functions, and proxy.conf.js can only forward
 * to a running server — so this exposes the same handler modules on a plain Node
 * server for development. Production still runs api/*.js on Vercel unchanged.
 *
 *   npm run dev:api      # terminal 1 — this server, port 3001
 *   npm start            # terminal 2 — ng serve, proxies /api/ocr here
 *
 * Set ANTHROPIC_API_KEY in this terminal (or in a .env file loaded by your shell)
 * before starting.
 */

const http = require('http');

const PORT = Number(process.env.DEV_API_PORT ?? 3001);
const MAX_BODY_BYTES = 12 * 1024 * 1024;

/** Only the routes that need a real runtime locally. Add a line per new function. */
const ROUTES = {
  '/api/ocr': require('../api/ocr'),
};

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Minimal stand-in for the Vercel response helpers the handlers use. */
function decorateResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
    return res;
  };
  return res;
}

const server = http.createServer(async (req, res) => {
  decorateResponse(res);

  const path = (req.url ?? '').split('?')[0];
  const handler = ROUTES[path];

  if (!handler) {
    return res.status(404).json({ error: `No local handler for ${path}` });
  }

  try {
    req.body = req.method === 'POST' ? await readRequestBody(req) : undefined;
    await handler(req, res);
  } catch (err) {
    console.error(`[dev-api] ${path} failed:`, err);
    if (!res.headersSent) res.status(500).json({ error: 'Local dev handler error' });
  }
});

server.listen(PORT, () => {
  const configured = process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING';
  console.log(`[dev-api] listening on http://localhost:${PORT}`);
  console.log(`[dev-api] routes: ${Object.keys(ROUTES).join(', ')}`);
  console.log(`[dev-api] ANTHROPIC_API_KEY is ${configured}`);
});

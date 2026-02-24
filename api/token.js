/**
 * Vercel serverless function: POST /api/token
 *
 * Proxies the OAuth2 client_credentials token request to Azure AD.
 * The client_secret is injected server-side from the AZURE_CLIENT_SECRET
 * environment variable set in the Vercel dashboard — it never lives in the
 * browser build.
 *
 * Required Vercel environment variable:
 *   AZURE_CLIENT_SECRET  — the Azure AD app client secret
 */

const TENANT_ID = '26c58d65-b577-4f92-aed2-cec1395d146d';
const AZURE_TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    if (!clientSecret) {
      return res.status(500).json({ error: 'AZURE_CLIENT_SECRET env variable is not set in Vercel' });
    }

    // Vercel parses application/x-www-form-urlencoded into an object OR leaves it as a string.
    // Handle both cases safely.
    const params = new URLSearchParams();
    const body = req.body;

    if (typeof body === 'string') {
      // Raw encoded string — parse it
      new URLSearchParams(body).forEach((value, key) => params.set(key, value));
    } else if (body && typeof body === 'object') {
      // Already parsed object
      Object.entries(body).forEach(([key, value]) => params.set(key, String(value)));
    }

    // Inject the server-side secret
    params.set('client_secret', clientSecret);

    const azureResponse = await fetch(AZURE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await azureResponse.json();
    res.status(azureResponse.status).json(data);

  } catch (err) {
    console.error('[api/token] Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
};

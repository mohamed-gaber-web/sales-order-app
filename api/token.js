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

  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!clientSecret) {
    return res.status(500).json({ error: 'AZURE_CLIENT_SECRET env variable is not set' });
  }

  // req.body is parsed by Vercel as an object for application/x-www-form-urlencoded
  const params = new URLSearchParams(req.body);
  params.set('client_secret', clientSecret);

  const response = await fetch(AZURE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json();
  res.status(response.status).json(data);
};

/**
 * Dev-server proxying.
 *
 * Most of what used to be here is gone, and its absence is the point. There were
 * rules forwarding `/api/token` to Microsoft Entra (stripping `Origin` and
 * `Referer` so the directory would accept a browser-originated
 * `client_credentials` request), and `/data` and `/api/services` straight to one
 * customer's D365 instance. Between them they existed so the app could hold an
 * ERP credential and use it.
 *
 * It no longer holds one. ERP traffic goes to the admin API's `/d365` route,
 * which forwards it with a secret sealed on the server.
 *
 * There is deliberately **no rule for the API itself**. The app calls it by
 * absolute URL (`environment.platformApiBaseUrl`), so CORS applies in
 * development exactly as it will in production — a proxy here would hide a
 * misconfigured `PORTAL_ORIGIN` until deploy day, which is the worst possible
 * time to find it. The API must list this dev server's origin; see
 * `PORTAL_ORIGIN` in the admin-portal `.env`.
 */
module.exports = {
  // Document reader (Claude vision) — the ANTHROPIC_API_KEY lives server-side.
  // `ng serve` cannot execute Vercel functions, so this forwards to the local
  // handler host started by `npm run dev:api`. On Vercel, api/ocr.js serves it.
  '/api/ocr': {
    target: 'http://localhost:3001',
    changeOrigin: false,
    secure: false,
  },
};

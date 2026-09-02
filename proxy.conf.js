// Dev-server proxy. `vercel.json` performs the equivalent rewrites in production.
//
// NOTE: the Angular dev server matches contexts with a naive startsWith(), so no
// context here may be a string-prefix of another.
module.exports = {
  // Grow Path Admin Portal API — user sign-in, sessions, and the /d365 ERP
  // pass-through that replaced every direct Dynamics call.
  //
  // Proxied rather than called directly so the browser makes no cross-origin
  // request: the portal's CORS allowlist (PORTAL_ORIGIN) then needs no entry for
  // this app's dev server.
  '/api/portal': {
    target: 'https://admin-portal-production-db9b.up.railway.app',
    changeOrigin: true,
    secure: true,
    pathRewrite: {
      '^/api/portal': '',
    },
  },

  // Document reader (Claude vision) — the ANTHROPIC_API_KEY lives server-side.
  // `ng serve` cannot execute Vercel functions, so this forwards to the local
  // handler host started by `npm run dev:api`. On Vercel, api/ocr.js serves it.
  '/api/ocr': {
    target: 'http://localhost:3001',
    changeOrigin: false,
    secure: false,
  },

  // TEMPORARY: Elsewedy sandbox — testing purchase order list + confirm-receipt
  // only. This is the one path left that still sends a client secret from the
  // device; remove it, and these three contexts, alongside
  // testPurchaseOrderEnv.useTestPurchaseOrderEnv once the testing is done.
  '/api/test-token': {
    target: 'https://login.microsoftonline.com',
    changeOrigin: true,
    secure: true,
    pathRewrite: {
      '^/api/test-token': '/d3bf51d6-e2cb-4b8e-bf3c-bbd32fe8e86a/oauth2/v2.0/token',
    },
    onProxyReq: (proxyReq) => {
      // Azure AD rejects a token request carrying a browser Origin (AADSTS9002326).
      proxyReq.removeHeader('Origin');
      proxyReq.removeHeader('Referer');
    },
  },
  '/api/test-services': {
    target: 'https://elsewedy.sandbox.operations.dynamics.com',
    changeOrigin: true,
    secure: true,
    pathRewrite: {
      '^/api/test-services': '/api/services',
    },
  },
  '/api/test-data': {
    target: 'https://elsewedy.sandbox.operations.dynamics.com',
    changeOrigin: true,
    secure: true,
    pathRewrite: {
      '^/api/test-data': '/data',
    },
  },
};

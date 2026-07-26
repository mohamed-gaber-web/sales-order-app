module.exports = {
  // Azure AD token endpoint
  '/api/token': {
    target: 'https://login.microsoftonline.com',
    changeOrigin: true,
    secure: true,
    pathRewrite: {
      '^/api/token': '/26c58d65-b577-4f92-aed2-cec1395d146d/oauth2/v2.0/token',
    },
    onProxyReq: (proxyReq) => {
      // Remove Origin/Referer so Azure AD doesn't reject with AADSTS9002326
      proxyReq.removeHeader('Origin');
      proxyReq.removeHeader('Referer');
    },
  },

  // D365 OData API
  '/data': {
    target: 'https://gp-customers.sandbox.operations.eu.dynamics.com',
    changeOrigin: true,
    secure: true,
  },

  // D365 custom services (e.g. product receipt)
  '/api/services': {
    target: 'https://gp-customers.sandbox.operations.eu.dynamics.com',
    changeOrigin: true,
    secure: true,
  },

  // TEMPORARY: Elsewedy sandbox — testing purchase order list + confirm-receipt only.
  // Remove alongside environment.useTestPurchaseOrderEnv once testing is done.
  // NOTE: must NOT be a string-prefix of '/api/token' above — the dev-server proxy
  // matches contexts with a naive startsWith(), so e.g. '/api/token-test-po' would be
  // swallowed by the '/api/token' rule before ever reaching this one.
  '/api/test-token': {
    target: 'https://login.microsoftonline.com',
    changeOrigin: true,
    secure: true,
    pathRewrite: {
      '^/api/test-token': '/d3bf51d6-e2cb-4b8e-bf3c-bbd32fe8e86a/oauth2/v2.0/token',
    },
    onProxyReq: (proxyReq) => {
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

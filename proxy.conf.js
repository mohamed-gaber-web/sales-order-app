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
    target: 'https://growpath.sandbox.operations.eu.dynamics.com',
    changeOrigin: true,
    secure: true,
  },
};

export const environment = {
  production: true,
  auth: {
    tokenUrl: 'https://login.microsoftonline.com/26c58d65-b577-4f92-aed2-cec1395d146d/oauth2/v2.0/token',
    clientId: 'db61ee09-84a1-4912-b319-709480fa243a',
    clientSecret: '', // Used on native only; web goes through Vercel /api/token which injects it server-side
    scope: 'https://gp-customers.sandbox.operations.eu.dynamics.com/.default',
    grantType: 'client_credentials',
  },
  // Interactive user sign-in (MSAL) — same SPA registration notes as environment.ts
  userAuth: {
    clientId: 'db61ee09-84a1-4912-b319-709480fa243a',
    authority: 'https://login.microsoftonline.com/26c58d65-b577-4f92-aed2-cec1395d146d',
    redirectUri: '/auth/login',
    scopes: ['openid', 'profile', 'email', 'User.Read'],
  },
  apiBaseUrl: '',
  d365BaseUrl: 'https://gp-customers.sandbox.operations.eu.dynamics.com',
  // Origin serving /api/ocr (the paper-PO document reader). Web leaves this
  // empty so Vercel routes the relative path; a native build needs the
  // deployed origin here, e.g. 'https://your-app.vercel.app'.
  ocrApiBaseUrl: '',
};

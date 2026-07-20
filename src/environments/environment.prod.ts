export const environment = {
  production: true,
  auth: {
    tokenUrl: 'https://login.microsoftonline.com/26c58d65-b577-4f92-aed2-cec1395d146d/oauth2/v2.0/token',
    clientId: 'db61ee09-84a1-4912-b319-709480fa243a',
    clientSecret: '', // Injected by Vercel /api/token (web) or a local override (native) — never commit a real secret
    scope: 'https://growpath.sandbox.operations.eu.dynamics.com/.default',
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
  d365BaseUrl: 'https://growpath.sandbox.operations.eu.dynamics.com',
};

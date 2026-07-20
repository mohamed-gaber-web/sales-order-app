// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  auth: {
    tokenUrl: 'https://login.microsoftonline.com/26c58d65-b577-4f92-aed2-cec1395d146d/oauth2/v2.0/token',
    clientId: 'db61ee09-84a1-4912-b319-709480fa243a',
    clientSecret: '',  // Set via environment variable or local override — do not commit real secrets
    scope: 'https://gp-customers.sandbox.operations.eu.dynamics.com/.default',
    grantType: 'client_credentials',
  },
  // Interactive user sign-in (MSAL / Authorization Code Flow with PKCE).
  // Uses a PUBLIC-CLIENT / SPA app registration — NO client secret on the device.
  // TODO(Azure): replace `clientId` with a dedicated SPA app registration that has
  //   a "Single-page application" platform with redirect URI `<origin>/auth/login`
  //   registered. The confidential client above (client_credentials) must NOT be reused
  //   for this — it has no SPA redirect URIs configured.
  userAuth: {
    clientId: 'db61ee09-84a1-4912-b319-709480fa243a',
    authority: 'https://login.microsoftonline.com/26c58d65-b577-4f92-aed2-cec1395d146d',
    // Relative URI — MSAL resolves it against window.location.origin, so it works in
    // dev (http://localhost:4200) and prod without per-environment edits.
    redirectUri: '/auth/login',
    scopes: ['openid', 'profile', 'email', 'User.Read'],
  },
  apiBaseUrl: '',
  d365BaseUrl: 'https://gp-customers.sandbox.operations.eu.dynamics.com',
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.

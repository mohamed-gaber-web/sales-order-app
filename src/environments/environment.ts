// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

/**
 * What is left of the build-time environment.
 *
 * This file used to carry a Microsoft Entra **confidential client** — client id,
 * client secret, and `client_credentials` against `<instance>/.default`, which is
 * unrestricted application access to the customer's ERP with no user context —
 * inside every installed build. It also carried one customer's D365 instance
 * URL, which is why one build could serve exactly one customer.
 *
 * All of it now lives on the server. The secret is sealed on `d365_environment`
 * and never leaves; the API calls D365 on the device's behalf. The public half
 * — the API base URL for a tenant, and the minimum app version it will serve —
 * comes from `GET /mobile/config?slug=` at runtime, through `RuntimeConfigService`.
 *
 * What remains is the smallest thing a freshly installed app has to be told
 * before it can ask anything: where to send its first request. Everything else
 * it learns after somebody signs in.
 */
export const environment = {
  production: false,

  /**
   * Where sign-in happens, and where config is fetched from before a tenant is
   * known.
   *
   * The one value that cannot come from the server, because it is the address of
   * the server. A tenant may name a different `apiBaseUrl` in its mobile
   * configuration, and the app adopts it after sign-in; this is the bootstrap.
   */
  platformApiBaseUrl: 'http://localhost:3000',

  /**
   * Origin serving `/api/ocr`, the paper-PO document reader.
   *
   * Still build-time because OCR is a Vercel function rather than part of the
   * API. Web leaves it empty so the relative path routes; a native build needs
   * the deployed origin. Declared here as well as in the production file — its
   * absence from this one was a compile error in every development build.
   */
  ocrApiBaseUrl: '',

  /** Compared against a tenant's `minimumAppVersion`. Keep in step with android/app/build.gradle. */
  appVersion: '1.0.0',
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.

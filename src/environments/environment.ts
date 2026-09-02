// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,

  /** This build's version, compared against the tenant's `minimumAppVersion`. */
  appVersion: '1.0.0',

  /**
   * The tenant this build bootstraps as. Not a credential — it names which
   * configuration to fetch from `/mobile/config`; the API host, workspace name
   * and version floor all come back in that response.
   */
  tenantSlug: 'test2',

  /**
   * Origin serving `/api/ocr`, the paper-PO document reader.
   *
   * Declared here as well as in the production file. Its absence from this one
   * was a compile error in every development build — `DocumentOcrService` reads
   * it unconditionally — while production, which had it, built cleanly. Web
   * leaves it empty so the relative path routes; a native build needs the
   * deployed origin.
   */
  ocrApiBaseUrl: '',

  /**
   * The Grow Path Admin Portal API — where users sign in.
   *
   * Web and mobile both use this API. Only the way the URL is written differs:
   * native addresses it absolutely (CapacitorHttp goes through the OS, so no
   * CORS preflight), while web calls the `/api/portal` prefix, which
   * `proxy.conf.js` strips in development and `vercel.json` rewrites in
   * production — keeping the browser same-origin.
   *
   * Carries no credential of any kind. Sign-in is email and password, and the
   * Dynamics credential lives in the portal, per tenant.
   */
  portalApiBaseUrl: 'https://admin-portal-production-db9b.up.railway.app',
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.

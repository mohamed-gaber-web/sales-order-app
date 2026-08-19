/**
 * The production build-time environment.
 *
 * Deliberately the same shape as `environment.ts`, and deliberately almost
 * empty. See that file for why the Entra client and the D365 instance URL are
 * no longer here.
 */
export const environment = {
  production: true,

  /**
   * Where sign-in happens, and where config is fetched from before a tenant is
   * known.
   *
   * Empty means same-origin, which is what a web deployment served alongside the
   * API behind a reverse proxy wants. **A native build must set this to the
   * deployed API origin** — a relative URL on a device resolves against the
   * WebView, where nothing is listening.
   */
  platformApiBaseUrl: '',

  /**
   * Origin serving `/api/ocr`, the paper-PO document reader.
   *
   * Web leaves this empty so Vercel routes the relative path; a native build
   * needs the deployed origin here, e.g. 'https://your-app.vercel.app'.
   */
  ocrApiBaseUrl: '',

  /** Compared against a tenant's `minimumAppVersion`. Keep in step with android/app/build.gradle. */
  appVersion: '1.0.0',
};

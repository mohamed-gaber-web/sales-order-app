export const environment = {
  production: true,

  /**
   * This build's version, compared against the tenant's `minimumAppVersion`.
   *
   * Dotted numbers. Keep it in step with the native project's versionName so
   * the floor a tenant sets means what an administrator thinks it means.
   */
  appVersion: '1.0.0',

  /**
   * The tenant this build bootstraps as.
   *
   * The only customer-specific value left in the bundle, and it is not a
   * credential — it names which configuration to fetch from `/mobile/config`.
   * Everything else (API host, workspace name, version floor) comes back in
   * that response, so changing where a tenant is served is a portal edit rather
   * than a rebuild.
   */
  tenantSlug: 'test2',

  /**
   * The Grow Path Admin Portal API.
   *
   * Everything the app asks of a server goes here: user sign-in, sessions, and
   * the `/d365` pass-through that replaced every direct Dynamics call. The
   * portal holds the ERP credential server-side, which is why no Azure
   * `client_credentials` secret appears in this file any more — an APK can be
   * unzipped in seconds, so a confidential secret inside one is a published one.
   *
   * Used on **native only**, where CapacitorHttp sends requests through the OS
   * and there is no proxy (and no CORS preflight). The web build calls the
   * `/api/portal` prefix, which `vercel.json` rewrites to this same host.
   */
  portalApiBaseUrl: 'https://admin-portal-production-db9b.up.railway.app',

  /**
   * Origin serving `/api/ocr`, the paper-PO document reader.
   *
   * Web leaves this empty so the relative path routes through Vercel. A native
   * build needs the deployed origin here, e.g. 'https://your-app.vercel.app',
   * or document scanning reports itself as unconfigured.
   */
  ocrApiBaseUrl: '',
};

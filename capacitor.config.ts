import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.growpath.app',
  appName: 'Grow Path',
  webDir: 'www',
  server: {
    androidScheme: 'https',
  },
  android: {
    /**
     * `allowMixedContent` is deliberately **not** set.
     *
     * It used to be `true`, from when this app talked to things over http in
     * development. Every request it makes now carries the user's access token,
     * and permitting a downgrade to cleartext permits that token to be disclosed
     * on any hop that manages to force one.
     */
  },
  plugins: {
    /**
     * Requests leave through the OS rather than the WebView.
     *
     * Worth knowing when reasoning about security here: this bypasses CORS
     * entirely on device, so a device working proves nothing about whether the
     * API's `PORTAL_ORIGIN` allowlist is right for the browser build. Both have
     * to be tested. What protects the device path is TLS and the bearer token,
     * which is the normal arrangement for a native app.
     */
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;

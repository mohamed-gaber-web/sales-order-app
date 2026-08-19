import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Where things that must survive a restart are kept.
 *
 * Capacitor Preferences rather than `localStorage`, which is what this app used
 * for everything. On Android that means `SharedPreferences` — owned by the app
 * rather than by the WebView, so it survives a WebView data clear and is not
 * reachable from any page the WebView happens to load.
 *
 * **It is not secure storage, and should not be described as such.**
 * `SharedPreferences` is readable on a rooted device, and via `adb backup` on a
 * debuggable build. The reason that is an acceptable trade here rather than a
 * gap: the credential actually worth stealing — the D365 client secret, which
 * opened a customer's whole ERP — is no longer on the device at all. What is
 * left is a refresh token that is single-use, revoked family-wide on replay,
 * expires in fourteen days, and can be killed server-side from `POST /auth/logout`.
 *
 * A Keystore-backed plugin is the better end state. The trigger for adding one
 * is this app starting to hold offline order data, or a customer's security
 * review asking — not before, because a third-party native plugin costs build
 * and supply-chain risk that today buys very little.
 */

/** Keys this app owns. Named so a stray value in the store is identifiable. */
export const STORAGE_KEYS = {
  refreshToken: 'gp.refreshToken',
  identity: 'gp.identity',
  mobileConfig: 'gp.mobileConfig',
  selectedCompany: 'gp.selectedCompany',
  lastEmail: 'gp.lastEmail',
} as const;

/**
 * Keys written by the version of this app that held a D365 credential.
 *
 * `access_token` in particular held an **application-level ERP token**, minted
 * from the client secret that used to ship in `environment.ts`. An upgraded
 * device that kept it would keep a working credential for the rest of its hour,
 * in the storage this whole change exists to empty — so these are deleted on
 * first run rather than merely stopped being written.
 */
const LEGACY_KEYS = [
  'access_token',
  'token_expiry',
  'test_po_access_token',
  'test_po_token_expiry',
  'gp_auth_user',
];

@Injectable({ providedIn: 'root' })
export class DeviceStorageService {
  async get(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Hand-edited, half-written, or written by an older shape. Losing it costs
      // one sign-in; throwing here would cost the app its launch.
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  }

  async setJson(key: string, value: unknown): Promise<void> {
    await this.set(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  }

  /**
   * Removes the previous version's credentials.
   *
   * Runs on every launch rather than behind a "have I migrated" flag: it is two
   * cheap deletes, and a flag is one more thing that can be wrong on the device
   * where it matters.
   */
  purgeLegacyCredentials(): void {
    for (const key of LEGACY_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Private mode, or no localStorage on this platform. Nothing to purge.
      }
    }
  }
}

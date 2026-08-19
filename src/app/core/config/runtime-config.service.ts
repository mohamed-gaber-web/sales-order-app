import { inject, Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { API_ROUTES, D365_PROXY_PREFIX, type MobileConfig } from '../api/api-contracts';
import { DeviceStorageService, STORAGE_KEYS } from '../storage/device-storage.service';

/**
 * Where this app sends its requests, resolved at runtime (US-040).
 *
 * This replaces the half of `environment.ts` that made one build serve exactly
 * one customer. The app now ships knowing only `platformApiBaseUrl` — where to
 * sign in — and learns the rest from `GET /mobile/config?slug=` once a sign-in
 * has told it which tenant it is in.
 *
 * ### Why the config is fetched after sign-in rather than before
 *
 * The endpoint is keyed by tenant slug, and a freshly installed app does not
 * know its slug. It could ask the user for one, but that is an identifier most
 * people have never seen. Sign-in already resolves the tenant from the address —
 * `POST /auth/login` takes no slug and returns `tenant.slug` — so the cheapest
 * path is to let the credential the user does know produce the identifier they
 * do not.
 *
 * ### Why launch never blocks on it
 *
 * The persisted copy is adopted synchronously at startup and refreshed in the
 * background. A van on a route is offline often, and `updatedAt` exists in the
 * response precisely so a client can cache rather than re-fetch — a launch that
 * waited on this endpoint is a launch that fails in a warehouse basement.
 */
@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(DeviceStorageService);

  private readonly configState = signal<MobileConfig | null>(null);

  readonly config = this.configState.asReadonly();
  readonly tenantName = computed(() => this.configState()?.tenantName ?? '');
  readonly minimumAppVersion = computed(() => this.configState()?.minimumAppVersion ?? null);

  /** Where sign-in and config live. Never a tenant's own base URL. */
  get platformApiBaseUrl(): string {
    return environment.platformApiBaseUrl;
  }

  /**
   * Where tenant-scoped calls go.
   *
   * A tenant may name its own `apiBaseUrl`; until one is known this is the
   * platform's. Read per request rather than captured once, so adopting a
   * config mid-session takes effect on the next call rather than the next
   * launch.
   */
  get apiBaseUrl(): string {
    return this.configState()?.apiBaseUrl || environment.platformApiBaseUrl;
  }

  /**
   * The ERP, as this app now reaches it.
   *
   * Every OData path the twenty domain services build is unchanged — only what
   * they are appended to has moved, from the customer's D365 instance to a route
   * on our own API that holds the credential.
   */
  get d365BaseUrl(): string {
    return `${this.apiBaseUrl}${D365_PROXY_PREFIX}`;
  }

  /** Origin serving `/api/ocr`. Still build-time; OCR is not part of the API. */
  get ocrApiBaseUrl(): string {
    return environment.ocrApiBaseUrl;
  }

  get appVersion(): string {
    return environment.appVersion;
  }

  /** Adopts whatever was stored last run. Does not touch the network. */
  async restore(): Promise<void> {
    const stored = await this.storage.getJson<MobileConfig>(STORAGE_KEYS.mobileConfig);
    if (stored) this.configState.set(stored);
  }

  /**
   * Fetches this tenant's configuration and adopts it.
   *
   * Unauthenticated, and it has to be — this is the endpoint that says where the
   * API is, so requiring a token would require the app to already know the
   * answer. Fetched from the *platform* origin, because a tenant's own
   * `apiBaseUrl` is the thing being looked up.
   *
   * Failure is deliberately not fatal. A device that cannot reach this endpoint
   * but holds a stored copy is a device that should keep working.
   */
  async hydrate(slug: string): Promise<void> {
    try {
      const config = await firstValueFrom(
        this.http.get<MobileConfig>(
          `${environment.platformApiBaseUrl}${API_ROUTES.mobileConfig}`,
          { params: { slug } }
        )
      );
      // An http:// base URL would put every access token this device sends on a
      // cleartext hop. The API refuses to store one; this refuses to adopt one,
      // because the two checks fail in different places and only one of them is
      // on the device that would be disclosed.
      if (config.apiBaseUrl && !/^https:\/\//i.test(config.apiBaseUrl) && environment.production) {
        return;
      }
      this.configState.set(config);
      await this.storage.setJson(STORAGE_KEYS.mobileConfig, config);
    } catch {
      // Offline, throttled, or a tenant with no configuration yet. The stored
      // copy stands, and the platform base URL works regardless.
    }
  }

  async clear(): Promise<void> {
    this.configState.set(null);
    await this.storage.remove(STORAGE_KEYS.mobileConfig);
  }

  /**
   * Whether this build is older than the tenant will serve.
   *
   * Absent or unparsable config means "no", deliberately. A version floor that
   * locked out a device which simply could not reach the endpoint would be worse
   * than the build it was blocking.
   */
  isBelowMinimumVersion(): boolean {
    const floor = this.minimumAppVersion();
    if (!floor) return false;
    return compareVersions(environment.appVersion, floor) < 0;
  }
}

/** Compares dotted numeric versions. Missing parts count as zero. */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] =>
    value.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index++) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

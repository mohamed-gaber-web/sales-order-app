import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  MobileConfig,
  MobileConfigSource,
  isBelowMinimum,
  isMobileConfig,
} from './mobile-config.models';

const CONFIG_KEY = 'gp_mobile_config';

/**
 * The runtime configuration in force, as signals the whole app reads.
 *
 * Kept separate from the service that fetches it so `PortalApiService` can read
 * `apiBaseUrl` without depending on `HttpClient` — which would close a circle
 * between the thing that makes requests and the thing that decides where they go.
 *
 * The bundled `environment` values are the floor, never the target: they are
 * what a first launch uses before the network answers, and what an offline
 * launch falls back to. Once a real configuration has been fetched it is cached,
 * and every later launch starts from the cache.
 */
@Injectable({ providedIn: 'root' })
export class MobileConfigStore {
  private readonly configState = signal<MobileConfig | null>(restore());
  private readonly sourceState = signal<MobileConfigSource>(
    restore() ? 'cache' : 'bundled'
  );

  readonly config = this.configState.asReadonly();

  /** Where the configuration in force came from: network, cache, or the bundle. */
  readonly source = this.sourceState.asReadonly();

  /**
   * Where API calls go.
   *
   * Falls back to the bundled base so the app is never left with nowhere to
   * send a request — a device that cannot reach the bootstrap endpoint on its
   * very first launch still gets a working default rather than a dead shell.
   */
  readonly apiBaseUrl = computed(
    () => this.configState()?.apiBaseUrl ?? environment.portalApiBaseUrl
  );

  /** The workspace name, known before sign-in. Empty until a config is in force. */
  readonly tenantName = computed(() => this.configState()?.tenantName ?? '');

  readonly tenantSlug = computed(
    () => this.configState()?.tenantSlug ?? environment.tenantSlug
  );

  /**
   * True when this build is older than the floor the tenant will serve (US-103).
   *
   * Advisory here rather than a hard gate: the API is what actually refuses an
   * outdated client, and locking a rep out of a working app because a version
   * string was misread would be worse than the problem it prevents.
   */
  readonly updateRequired = computed(() =>
    isBelowMinimum(environment.appVersion, this.configState()?.minimumAppVersion ?? null)
  );

  /**
   * Adopts a freshly fetched configuration.
   *
   * Returns true when it names a different tenant than the one in force —
   * the caller signs the session out on that, because a refresh token issued by
   * one installation means nothing to another.
   */
  set(config: MobileConfig, source: MobileConfigSource = 'network'): boolean {
    const previous = this.configState()?.tenantSlug;
    this.configState.set(config);
    this.sourceState.set(source);
    write(CONFIG_KEY, JSON.stringify(config));
    return previous !== undefined && previous !== config.tenantSlug;
  }

  /** Drops the cached configuration, so the next launch bootstraps from scratch. */
  clear(): void {
    this.configState.set(null);
    this.sourceState.set('bundled');
    write(CONFIG_KEY, null);
  }
}

function restore(): MobileConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isMobileConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Storage that cannot throw. Private browsing and full quotas both raise here. */
function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Losing the cache costs one bootstrap request; throwing costs the app.
  }
}

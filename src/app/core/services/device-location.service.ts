import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { GeoPoint } from '../../models/van-journey.model';

/** How long to wait for a fix before giving up on it. */
const FIX_TIMEOUT_MS = 8000;

/** A fix this old is still good enough to sequence a route from. */
const MAX_FIX_AGE_MS = 60_000;

/**
 * The device's own position.
 *
 * Uses the browser's Geolocation API, which the Capacitor WebView implements on
 * both platforms — so no plugin, and one code path for web and native. The
 * `@capacitor/geolocation` plugin would buy finer control over accuracy and
 * background updates; nothing here needs either yet, and it is a drop-in swap
 * behind this service if that changes.
 *
 * Never rejects. A driver who declined the permission, or is parked inside a
 * warehouse with no sky, still has a day to work, and a route screen that
 * errors instead of falling back to a known position would be useless exactly
 * where it is needed. The caller gets `null` and decides what to measure from.
 */
@Injectable({ providedIn: 'root' })
export class DeviceLocationService {
  /** True when the platform can even be asked. */
  readonly available = typeof navigator !== 'undefined' && !!navigator.geolocation;

  /**
   * One position fix, or `null` if it cannot be had.
   *
   * `enableHighAccuracy` is on: sequencing stops that can sit a few hundred
   * metres apart is exactly the case where a coarse network fix reorders the
   * list wrongly.
   */
  getCurrent(): Observable<GeoPoint | null> {
    if (!this.available) return of(null);

    return new Observable<GeoPoint | null>((subscriber) => {
      let settled = false;
      const settle = (value: GeoPoint | null) => {
        if (settled) return;
        settled = true;
        subscriber.next(value);
        subscriber.complete();
      };

      navigator.geolocation.getCurrentPosition(
        (position) =>
          settle({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }),
        () => settle(null),
        {
          enableHighAccuracy: true,
          timeout: FIX_TIMEOUT_MS,
          maximumAge: MAX_FIX_AGE_MS,
        }
      );
    });
  }
}

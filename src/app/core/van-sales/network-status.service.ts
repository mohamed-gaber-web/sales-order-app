import { computed, Injectable, NgZone, inject, signal } from '@angular/core';
import { Network } from '@capacitor/network';

/**
 * Whether the device can reach the backend right now (spec §9).
 *
 * `@capacitor/network` on native, which reports the OS's view; on web the same
 * plugin falls back to `navigator.onLine` and the window's online/offline
 * events. A dev-only "simulate offline" switch sits on top, so acceptance
 * scenario 10 can be run on a desk.
 */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly zone = inject(NgZone);
  private readonly deviceOnline = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  private readonly simulatedOffline = signal(false);

  readonly online = computed(() => this.deviceOnline() && !this.simulatedOffline());
  readonly simulatingOffline = this.simulatedOffline.asReadonly();

  constructor() {
    Network.getStatus()
      .then((s) => this.deviceOnline.set(s.connected))
      .catch(() => undefined);
    Network.addListener('networkStatusChange', (s) => this.zone.run(() => this.deviceOnline.set(s.connected))).catch(
      () => undefined
    );
  }

  setSimulatedOffline(value: boolean): void {
    this.simulatedOffline.set(value);
  }
}

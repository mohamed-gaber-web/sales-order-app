import { inject, Injectable, signal } from '@angular/core';
import { VAN_SALES_CONFIG } from './van-sales.config';
import { NetworkStatusService } from './network-status.service';
import { VanSalesMockApi } from './van-sales-mock.api';

/**
 * Desk-testing switches for Van Sales, available only when
 * `environment.devTools` is on: simulate losing signal, simulate standing at
 * the customer (for the geofence), and wipe the mock server and the device's
 * van data back to the seed. Role switching lives on `VanRoleService`.
 */
@Injectable({ providedIn: 'root' })
export class VanDevToolsService {
  private readonly network = inject(NetworkStatusService);
  private readonly mock = inject(VanSalesMockApi);

  readonly enabled = VAN_SALES_CONFIG.devTools;
  /** Treat every check-in as inside the geofence. */
  readonly atCustomer = signal(false);
  readonly offline = this.network.simulatingOffline;

  setOffline(value: boolean): void {
    if (this.enabled) this.network.setSimulatedOffline(value);
  }

  setAtCustomer(value: boolean): void {
    if (this.enabled) this.atCustomer.set(value);
  }

  /** Clears every van-sales key on the device and the mock server, then reloads. */
  resetAll(): void {
    if (!this.enabled) return;
    this.mock.resetServer();
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('gp.vanSales.') && k !== 'gp.vanSales.devRole')
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      // Nothing stored.
    }
    location.reload();
  }
}

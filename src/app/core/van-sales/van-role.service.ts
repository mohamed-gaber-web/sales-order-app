import { computed, inject, Injectable, signal } from '@angular/core';
import { VAN_SALES_CONFIG } from './van-sales.config';
import { Role, VanAction } from './van-sales.models';
import { VanStoreService } from './van-store.service';

const DEV_ROLE_KEY = 'gp.vanSales.devRole';

/**
 * What each role may do in a visit and around it (spec §3).
 *
 * Sellers do not see customer balances: they can still collect — typing what
 * the customer hands over, settled oldest invoice first — but the balance,
 * credit limit and invoice amounts stay with the roles that manage credit.
 */
const MATRIX: Record<Role, VanAction[]> = {
  VAN_SELLER: ['SELL', 'COLLECT', 'RETURN', 'FREE_RETURN', 'SURVEY', 'NO_SALE', 'NEW_CUSTOMER', 'VAN_STOCK', 'DAY_CLOSE'],
  PRE_SELLER: ['TAKE_ORDER', 'SURVEY', 'NO_SALE', 'NEW_CUSTOMER', 'DAY_CLOSE'],
  DELIVERY_REP: ['DELIVER', 'COLLECT', 'RETURN', 'FREE_RETURN', 'NO_SALE', 'VAN_STOCK', 'DAY_CLOSE', 'VIEW_BALANCE'],
  COLLECTOR: ['COLLECT', 'NO_SALE', 'DAY_CLOSE', 'VIEW_BALANCE'],
  SUPERVISOR: ['APPROVE', 'VIEW_BALANCE', 'MANAGE_SURVEYS'],
};

export const ROLE_LABEL: Record<Role, string> = {
  VAN_SELLER: 'Van seller',
  PRE_SELLER: 'Pre-seller',
  DELIVERY_REP: 'Delivery rep',
  COLLECTOR: 'Collector',
  SUPERVISOR: 'Supervisor',
};

export const ALL_ROLES: Role[] = ['VAN_SELLER', 'PRE_SELLER', 'DELIVERY_REP', 'COLLECTOR', 'SUPERVISOR'];

/**
 * The signed-in rep's Van Sales role.
 *
 * It comes from Rep & Van Setup (#12), never from the device. The one
 * exception is the dev-only switcher behind `environment.devTools`, which
 * exists so every role's screens can be exercised from one test account; a
 * production build ignores any stored override.
 */
@Injectable({ providedIn: 'root' })
export class VanRoleService {
  private readonly store = inject(VanStoreService);
  private readonly devRole = signal<Role | null>(VAN_SALES_CONFIG.devTools ? readDevRole() : null);

  readonly role = computed<Role>(() => this.devRole() ?? this.store.repSetup()?.role ?? 'VAN_SELLER');
  readonly roleLabel = computed(() => ROLE_LABEL[this.role()]);
  readonly isOverridden = computed(() => this.devRole() !== null);
  /** Whether customer balances, limits and invoice amounts are shown. */
  readonly seesBalance = computed(() => this.can('VIEW_BALANCE'));

  can(action: VanAction): boolean {
    const role = this.role();
    if (action === 'TAKE_ORDER' && role === 'DELIVERY_REP') return !!this.store.repSetup()?.deliveryCanTakeOrders;
    return MATRIX[role].includes(action);
  }

  /** Dev tools only. `null` goes back to the role from setup. */
  setDevRole(role: Role | null): void {
    if (!VAN_SALES_CONFIG.devTools) return;
    this.devRole.set(role);
    try {
      if (role) localStorage.setItem(DEV_ROLE_KEY, role);
      else localStorage.removeItem(DEV_ROLE_KEY);
    } catch {
      // Not persisted — fine for a dev switch.
    }
  }
}

function readDevRole(): Role | null {
  try {
    const r = localStorage.getItem(DEV_ROLE_KEY) as Role | null;
    return r && ALL_ROLES.includes(r) ? r : null;
  } catch {
    return null;
  }
}

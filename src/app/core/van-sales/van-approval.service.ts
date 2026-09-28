import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NetworkStatusService } from './network-status.service';
import { VanOutboxService } from './van-outbox.service';
import { VanSalesApiRouter } from './van-sales-api.router';
import { ApprovalRequest, ApprovalStatus, ApprovalType } from './van-sales.models';
import { VanStoreService } from './van-store.service';
import { localIsoDate, uuidV4 } from './van-uuid';

const STORAGE_KEY = 'gp.vanSales.approvals';
const POLL_MS = 8000;

interface StoredApproval extends ApprovalRequest {
  /** Used by a posted document — cannot unlock a second one. */
  consumed?: boolean;
}

/**
 * Supervisor approvals (spec §8.5): extra discount, credit override, free
 * return over limit, geofence override.
 *
 * A request is queued through the outbox (#90), so one raised offline reaches
 * the supervisor as soon as the van has signal. While any request is pending
 * the service polls for decisions; D365 business events (#45) can replace the
 * polling later without changing a caller. Approvals are good for the day they
 * were raised on and for one document each.
 */
@Injectable({ providedIn: 'root' })
export class VanApprovalService {
  private readonly api = inject(VanSalesApiRouter);
  private readonly outbox = inject(VanOutboxService);
  private readonly network = inject(NetworkStatusService);
  private readonly store = inject(VanStoreService);

  private readonly _mine = signal<StoredApproval[]>(this.restore());
  private readonly _all = signal<ApprovalRequest[]>([]);
  private readonly handlers = new Map<ApprovalType, ((a: ApprovalRequest) => void)[]>();

  /** Requests raised on this device today. */
  readonly mine = computed(() => this._mine().filter((a) => a.createdAt.slice(0, 10) === localIsoDate()));
  readonly myPending = computed(() => this.mine().filter((a) => a.status === 'PENDING'));
  /** Every request the supervisor can see — loaded by `refreshAll`. */
  readonly all = this._all.asReadonly();
  readonly allPending = computed(() => this._all().filter((a) => a.status === 'PENDING'));

  constructor() {
    const timer = setInterval(() => {
      if (this.myPending().length && this.network.online()) void this.poll();
    }, POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  request(type: ApprovalType, customerId: string, detail: string, payload: unknown): ApprovalRequest {
    const rep = this.store.repSetup();
    const req: StoredApproval = {
      id: `APR-${uuidV4().slice(0, 8).toUpperCase()}`,
      type,
      customerId,
      customerName: this.store.customer(customerId)?.name,
      repId: rep?.repId ?? '',
      detail,
      payload,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    this.save([...this._mine(), req]);
    this.outbox.enqueue({ apiNo: 90, label: 'Approval requests', body: { ...req } });
    return req;
  }

  /** An approved, unused approval of this type for this customer, today. */
  approved(customerId: string, type: ApprovalType): ApprovalRequest | undefined {
    return this.mine().find((a) => a.customerId === customerId && a.type === type && a.status === 'APPROVED' && !a.consumed);
  }

  pending(customerId: string, type: ApprovalType): ApprovalRequest | undefined {
    return this.mine().find((a) => a.customerId === customerId && a.type === type && a.status === 'PENDING');
  }

  latest(customerId: string, type: ApprovalType): ApprovalRequest | undefined {
    return [...this.mine()].reverse().find((a) => a.customerId === customerId && a.type === type && !a.consumed);
  }

  consume(id: string): void {
    this.save(this._mine().map((a) => (a.id === id ? { ...a, consumed: true } : a)));
  }

  /** Called once for each of this device's requests that turns APPROVED. */
  onApproved(type: ApprovalType, handler: (a: ApprovalRequest) => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  /** Pulls decisions for this device's pending requests. */
  async poll(): Promise<void> {
    try {
      const list = await firstValueFrom(this.api.listApprovals());
      this.merge(list);
    } catch {
      // Offline or the service is down — try on the next tick.
    }
  }

  // ── Supervisor ───────────────────────────────────────────────────────────

  async refreshAll(): Promise<void> {
    const list = await firstValueFrom(this.api.listApprovals());
    this._all.set([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    this.merge(list);
  }

  async decide(id: string, status: Exclude<ApprovalStatus, 'PENDING'>): Promise<void> {
    await firstValueFrom(this.api.decideApproval(id, status));
    await this.refreshAll();
  }

  /** Approvals do not carry over to tomorrow. */
  expireAll(): void {
    this.save(this._mine().map((a) => (a.status === 'PENDING' ? { ...a, status: 'REJECTED' as const } : { ...a, consumed: true })));
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private merge(server: ApprovalRequest[]): void {
    const byId = new Map(server.map((a) => [a.id, a]));
    const turned: ApprovalRequest[] = [];
    const next = this._mine().map((a) => {
      const s = byId.get(a.id);
      if (!s || s.status === a.status) return a;
      if (a.status === 'PENDING' && s.status === 'APPROVED') turned.push(s);
      return { ...a, status: s.status, decidedAt: s.decidedAt };
    });
    this.save(next);
    for (const a of turned) for (const h of this.handlers.get(a.type) ?? []) h({ ...a, payload: this.find(a.id)?.payload });
  }

  private find(id: string): StoredApproval | undefined {
    return this._mine().find((a) => a.id === id);
  }

  private save(list: StoredApproval[]): void {
    this._mine.set(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Session only.
    }
  }

  private restore(): StoredApproval[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? (JSON.parse(raw) as StoredApproval[]) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }
}

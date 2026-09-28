import { HttpErrorResponse } from '@angular/common/http';
import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, Subject } from 'rxjs';
import { NetworkStatusService } from './network-status.service';
import { VanAttachmentService } from './van-attachment.service';
import { VanBusinessError } from './van-sales-api';
import { VanSalesApiRouter } from './van-sales-api.router';
import { VanApiNo, VAN_ENDPOINTS } from './van-sales-endpoints';
import { OutboxItem } from './van-sales.models';
import { uuidV4 } from './van-uuid';

const STORAGE_KEY = 'gp.vanSales.outbox';
export const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60_000;
const TICK_MS = 15_000;

export interface EnqueueRequest {
  apiNo: VanApiNo;
  label: string;
  body: Record<string, unknown>;
  dependsOn?: string[];
  /** Pass one only when the caller already put it in a document it shows the user. */
  mobileTransId?: string;
}

/**
 * The offline outbox (spec §9). Every write in the van cycle is queued here
 * first and sent from here, so a document posted in a basement reaches D365
 * the moment the van is back in coverage — once.
 *
 * - `MobileTransId` is generated at enqueue and never regenerated; a retry
 *   sends the same one, and D365 answers a repeat with the original document.
 * - FIFO, with dependencies: an item waits until everything in `dependsOn`
 *   has POSTED (attachments after their parent, e-receipt after its invoice).
 * - Network failures back off exponentially; after five the item is FAILED
 *   and waits for a manual retry from day close. A business rejection
 *   (`Success: false`, or a 4xx) is FAILED at once — sending it again would
 *   only get the same answer.
 * - Persisted to localStorage, so it survives a restart. An item caught
 *   mid-send by a crash is re-sent, which idempotency makes safe.
 */
@Injectable({ providedIn: 'root' })
export class VanOutboxService {
  private readonly api = inject(VanSalesApiRouter);
  private readonly network = inject(NetworkStatusService);
  private readonly attachments = inject(VanAttachmentService);

  private readonly _items = signal<OutboxItem[]>(this.restore());
  private readonly _syncing = signal(false);
  private readonly _posted = new Subject<OutboxItem>();

  readonly items = this._items.asReadonly();
  readonly syncing = this._syncing.asReadonly();
  /** Emits each item as D365 accepts it. */
  readonly posted$ = this._posted.asObservable();

  readonly pending = computed(() => this._items().filter((i) => i.status !== 'POSTED'));
  readonly pendingCount = computed(() => this.pending().length);
  readonly failed = computed(() => this._items().filter((i) => i.status === 'FAILED'));
  readonly isEmpty = computed(() => this.pendingCount() === 0);

  /** Pending items by label, for the day-close breakdown. */
  readonly pendingByLabel = computed(() => {
    const counts = new Map<string, number>();
    for (const i of this.pending()) counts.set(i.label, (counts.get(i.label) ?? 0) + 1);
    return [...counts].map(([label, count]) => ({ label, count }));
  });

  constructor() {
    // Back online → send.
    effect(() => {
      if (this.network.online() && this.pendingCount() > 0) void this.sync();
    });
    // Backoff timers expire without any signal changing, so poll gently.
    const timer = setInterval(() => {
      if (this.network.online() && this.pendingCount() > 0) void this.sync();
    }, TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  enqueue(req: EnqueueRequest): OutboxItem {
    const mobileTransId = req.mobileTransId ?? uuidV4();
    const item: OutboxItem = {
      mobileTransId,
      apiNo: req.apiNo,
      endpoint: VAN_ENDPOINTS[req.apiNo],
      label: req.label,
      body: { ...req.body, MobileTransId: mobileTransId },
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: 'QUEUED',
      dependsOn: req.dependsOn?.length ? req.dependsOn : undefined,
    };
    this.update((items) => [...items, item]);
    if (this.network.online()) void this.sync();
    return item;
  }

  /** Puts a FAILED item back in the queue with a fresh attempt budget — same MobileTransId. */
  retry(mobileTransId: string): void {
    this.update((items) =>
      items.map((i) =>
        i.mobileTransId === mobileTransId && i.status === 'FAILED'
          ? { ...i, status: 'QUEUED', attempts: 0, nextAttemptAt: undefined }
          : i
      )
    );
    if (this.network.online()) void this.sync();
  }

  retryAllFailed(): void {
    for (const i of this.failed()) this.retry(i.mobileTransId);
  }

  /** Drops everything already posted. Called at day close. */
  clearPosted(): void {
    this.update((items) => items.filter((i) => i.status !== 'POSTED'));
  }

  find(mobileTransId: string): OutboxItem | undefined {
    return this._items().find((i) => i.mobileTransId === mobileTransId);
  }

  /**
   * Sends everything that is ready. Resolves with what happened in this pass.
   * Safe to call at any time; overlapping calls join the running pass.
   */
  sync(): Promise<{ posted: number; failed: number }> {
    this.running ??= this.runPass().finally(() => (this.running = null));
    return this.running;
  }

  private running: Promise<{ posted: number; failed: number }> | null = null;

  private async runPass(): Promise<{ posted: number; failed: number }> {
    this._syncing.set(true);
    let posted = 0;
    let failed = 0;
    try {
      // Bounded: each iteration either posts or parks one item.
      for (let guard = 0; guard < 500 && this.network.online(); guard++) {
        const next = this.nextReady();
        if (!next) break;
        const ok = await this.send(next);
        if (ok) posted++;
        else if (this.find(next.mobileTransId)?.status === 'FAILED') failed++;
      }
    } finally {
      this._syncing.set(false);
    }
    if (posted > 0) this.logSync(posted, failed);
    return { posted, failed };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private nextReady(): OutboxItem | undefined {
    const now = Date.now();
    const items = this._items();
    const status = new Map(items.map((i) => [i.mobileTransId, i.status]));
    return items.find(
      (i) =>
        i.status === 'QUEUED' &&
        (!i.nextAttemptAt || Date.parse(i.nextAttemptAt) <= now) &&
        (i.dependsOn ?? []).every((d) => status.get(d) === 'POSTED' || !status.has(d))
    );
  }

  private async send(item: OutboxItem): Promise<boolean> {
    this.patch(item.mobileTransId, { status: 'SENDING' });
    try {
      const body = await this.resolveBody(item);
      const env = await firstValueFrom(this.api.post(item.apiNo as VanApiNo, body));
      this.patch(item.mobileTransId, {
        status: 'POSTED',
        d365DocumentId: env.DocumentId,
        attempts: item.attempts + 1,
        lastError: undefined,
      });
      const done = this.find(item.mobileTransId);
      if (done) this._posted.next(done);
      return true;
    } catch (err) {
      const attempts = item.attempts + 1;
      const permanent = isPermanent(err);
      const exhausted = attempts >= MAX_ATTEMPTS;
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS);
      this.patch(item.mobileTransId, {
        status: permanent || exhausted ? 'FAILED' : 'QUEUED',
        attempts,
        lastError: describe(err),
        nextAttemptAt: new Date(Date.now() + backoff).toISOString(),
      });
      return false;
    }
  }

  /** Attachments are stored by id; the file itself is read only when it is sent. */
  private async resolveBody(item: OutboxItem): Promise<Record<string, unknown>> {
    const body = item.body as Record<string, unknown>;
    const id = body['AttachmentId'];
    if (item.apiNo !== 38 || typeof id !== 'string' || this.api.isMock) return body;
    const data = await this.attachments.read(id);
    if (data === null) throw new VanBusinessError('The photo for this upload is no longer on the device.');
    return { ...body, FileBase64: data.replace(/^data:[^,]*,/, '') };
  }

  private logSync(posted: number, failed: number): void {
    this.api
      .post(46, {
        MobileTransId: uuidV4(),
        Posted: posted,
        Failed: failed,
        Pending: this.pendingCount(),
        At: new Date().toISOString(),
      })
      .subscribe({ error: () => undefined });
  }

  private patch(id: string, patch: Partial<OutboxItem>): void {
    this.update((items) => items.map((i) => (i.mobileTransId === id ? { ...i, ...patch } : i)));
  }

  private update(fn: (items: OutboxItem[]) => OutboxItem[]): void {
    const next = fn(this._items());
    this._items.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota — the queue still works for this session.
    }
  }

  private restore(): OutboxItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const items = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
      if (!Array.isArray(items)) return [];
      // Anything caught mid-send is sent again — with the same MobileTransId.
      return items.map((i) => (i.status === 'SENDING' ? { ...i, status: 'QUEUED' } : i));
    } catch {
      return [];
    }
  }
}

function isPermanent(err: unknown): boolean {
  if (err instanceof VanBusinessError) return true;
  if (err instanceof HttpErrorResponse) {
    return err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 408 && err.status !== 429;
  }
  return false;
}

function describe(err: unknown): string {
  if (err instanceof VanBusinessError) return err.message;
  if (err instanceof HttpErrorResponse) {
    const e = err.error as { message?: string; Message?: string } | null;
    return e?.message ?? e?.Message ?? `HTTP ${err.status}`;
  }
  return err instanceof Error ? err.message : 'Unknown error';
}

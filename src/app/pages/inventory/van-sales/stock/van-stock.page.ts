import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { FormatService } from '../../../../core';
import { VanStockLine, VanStoreService, VanTransactionsService } from '../../../../core/van-sales';

type StockTab = 'onhand' | 'request' | 'receive' | 'damaged';

interface Incoming {
  id: string;
  at: string;
  lines: VanStockLine[];
}

/**
 * Van stock (spec §5 #20, #31–#33): what is on the van, asking the warehouse
 * for more, receiving it, and what came back damaged. Every write goes through
 * `VanTransactionsService`, which queues it in the outbox.
 */
@Component({
  selector: 'app-van-stock',
  templateUrl: './van-stock.page.html',
  styleUrls: ['./van-stock.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanStockPage {
  private readonly format = inject(FormatService);
  private readonly toastCtrl = inject(ToastController);
  private readonly tx = inject(VanTransactionsService);
  readonly store = inject(VanStoreService);

  readonly tab = signal<StockTab>('onhand');
  readonly query = signal('');
  /** Load request draft: item → qty. */
  readonly draft = signal<Record<string, number>>({});
  /** Received quantities per transfer, only where the rep changed them. */
  readonly received = signal<Record<string, Record<string, number>>>({});

  readonly locked = this.store.dayClosed;

  readonly onHand = computed(() => {
    const q = this.query().toLowerCase();
    return this.store
      .vanStock()
      .map((s) => ({ ...s, name: this.store.productName(s.itemId) }))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.itemId.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly totalUnits = computed(() => this.store.vanStock().reduce((s, l) => s + l.qty, 0));
  readonly zeroCount = computed(() => this.store.vanStock().filter((s) => s.qty <= 0).length);

  readonly catalog = computed(() => {
    const q = this.query().toLowerCase();
    return this.store
      .products()
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.itemId.toLowerCase().includes(q));
  });

  readonly draftLines = computed<VanStockLine[]>(() =>
    Object.entries(this.draft())
      .filter(([, qty]) => qty > 0)
      .map(([itemId, qty]) => ({ itemId, qty }))
  );
  readonly draftUnits = computed(() => this.draftLines().reduce((s, l) => s + l.qty, 0));

  readonly requests = computed(() => [...this.store.local().loadRequests].reverse());

  readonly incoming = computed<Incoming[]>(() => {
    const done = new Set(this.store.local().receivedTransfers);
    return this.store.local().loadRequests.filter((r) => !done.has(r.id));
  });

  readonly damaged = computed(() =>
    this.store.local().damaged.map((s) => ({ ...s, name: this.store.productName(s.itemId) }))
  );
  readonly damagedUnits = computed(() => this.store.local().damaged.reduce((s, l) => s + l.qty, 0));

  ionViewWillEnter(): void {
    void this.store.ensureLoaded();
  }

  setTab(t: StockTab): void {
    this.tab.set(t);
    this.query.set('');
  }

  // ── Load request ─────────────────────────────────────────────────────────

  qtyOf(itemId: string): number {
    return this.draft()[itemId] ?? 0;
  }

  step(itemId: string, delta: number): void {
    this.draft.update((d) => ({ ...d, [itemId]: Math.max(0, (d[itemId] ?? 0) + delta) }));
  }

  setQty(itemId: string, raw: string): void {
    const n = Math.max(0, Math.floor(Number(raw.replace(/[^\d]/g, '')) || 0));
    this.draft.update((d) => ({ ...d, [itemId]: n }));
  }

  async sendRequest(): Promise<void> {
    const lines = this.draftLines();
    if (!lines.length || this.locked()) return;
    const id = this.tx.requestLoad(lines);
    this.draft.set({});
    await this.toast(`Load request ${id} sent`, 'success');
  }

  // ── Receive ──────────────────────────────────────────────────────────────

  receivedQty(transferId: string, line: VanStockLine): number {
    return this.received()[transferId]?.[line.itemId] ?? line.qty;
  }

  setReceived(transferId: string, itemId: string, raw: string): void {
    const n = Math.max(0, Math.floor(Number(raw.replace(/[^\d]/g, '')) || 0));
    this.received.update((r) => ({ ...r, [transferId]: { ...(r[transferId] ?? {}), [itemId]: n } }));
  }

  async receive(t: Incoming): Promise<void> {
    if (this.locked()) return;
    const lines = t.lines
      .map((l) => ({ itemId: l.itemId, qty: this.receivedQty(t.id, l) }))
      .filter((l) => l.qty > 0);
    if (!lines.length) {
      await this.toast('Nothing to receive', 'medium');
      return;
    }
    this.tx.receiveLoad(t.id, lines);
    this.received.update((r) => {
      const next = { ...r };
      delete next[t.id];
      return next;
    });
    const units = lines.reduce((s, l) => s + l.qty, 0);
    await this.toast(`${this.n(units)} units received into van`, 'success');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  units(lines: VanStockLine[]): number {
    return lines.reduce((s, l) => s + l.qty, 0);
  }

  n(value: number): string {
    return this.format.number(value);
  }

  time(iso: string): string {
    return this.format.time(iso);
  }

  private async toast(message: string, color: 'success' | 'danger' | 'medium'): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 1800, position: 'top', color });
    await t.present();
  }
}

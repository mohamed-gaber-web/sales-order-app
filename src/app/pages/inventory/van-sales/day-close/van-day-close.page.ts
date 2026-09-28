import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { FormatService } from '../../../../core';
import { VanDayService } from '../../../../core/services/van-day.service';
import {
  NetworkStatusService,
  VanDocumentsService,
  VanOutboxService,
  VanStoreService,
  VanTransactionsService,
} from '../../../../core/van-sales';

/** Visit outcomes that count as a strike. */
const STRIKE_OUTCOMES = ['Sold', 'Delivered', 'Order taken'];

/**
 * Sync & day close (spec §7.9, F9, F14).
 *
 * Flush the outbox, hand over cash, e-wallet and cheques, unload the van,
 * review the day, then close it through `VanTransactionsService.closeDay`
 * (#33 unload, #41 day close). The close refuses while anything is unsent,
 * so the day close is always the last document of the day (scenario 11).
 */
@Component({
  selector: 'app-van-day-close',
  templateUrl: './van-day-close.page.html',
  styleUrls: ['./van-day-close.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanDayClosePage {
  private readonly format = inject(FormatService);
  private readonly toastCtrl = inject(ToastController);
  private readonly alertCtrl = inject(AlertController);
  private readonly router = inject(Router);
  private readonly tx = inject(VanTransactionsService);

  readonly day = inject(VanDayService);
  readonly store = inject(VanStoreService);
  readonly outbox = inject(VanOutboxService);
  readonly docs = inject(VanDocumentsService);
  readonly network = inject(NetworkStatusService);

  readonly closing = signal(false);
  readonly cashCounted = signal<number | null>(null);

  readonly totals = this.tx.dayTotals;
  readonly closed = this.store.dayClosed;

  readonly pendingCount = this.outbox.pendingCount;
  readonly eDocsWaiting = computed(() => this.docs.eDocsWaiting().length);

  readonly variance = computed(() => {
    const counted = this.cashCounted();
    return counted === null ? null : Math.round((counted - this.totals().cashExpected) * 100) / 100;
  });

  readonly chequeTotal = computed(() => this.docs.chequesInHand().reduce((s, c) => s + c.amount, 0));

  readonly sellable = computed(() => this.store.vanStock().filter((s) => s.qty > 0));
  readonly sellableUnits = computed(() => this.sellable().reduce((s, l) => s + l.qty, 0));
  readonly damagedUnits = computed(() => this.store.local().damaged.reduce((s, l) => s + l.qty, 0));

  readonly visited = computed(() => this.day.visits().filter((v) => v.status === 'done').length);

  /** Share of visited stops that ended in a sale, a delivery or an order. */
  readonly strikeRate = computed(() => {
    const done = this.day.visits().filter((v) => v.status === 'done');
    if (!done.length) return 0;
    const hits = done.filter((v) => STRIKE_OUTCOMES.some((o) => v.outcome?.includes(o))).length;
    return Math.round((hits / done.length) * 100);
  });

  ionViewWillEnter(): void {
    void this.store.ensureLoaded();
  }

  // ── Sync ─────────────────────────────────────────────────────────────────

  async syncNow(): Promise<void> {
    if (!this.network.online()) {
      await this.toast('Offline. Sync starts when the van is back online.', 'medium');
      return;
    }
    await this.runSync();
  }

  /** The footer's "Go online and sync": also puts failed items back in the queue. */
  async syncAll(): Promise<void> {
    if (!this.network.online()) return;
    if (this.outbox.failed().length) this.outbox.retryAllFailed();
    await this.runSync();
  }

  retry(mobileTransId: string): void {
    this.outbox.retry(mobileTransId);
  }

  retryAll(): void {
    this.outbox.retryAllFailed();
  }

  private async runSync(): Promise<void> {
    const before = this.pendingCount();
    await this.outbox.sync();
    await this.settle();
    const left = this.pendingCount();
    const sent = Math.max(0, before - left);
    if (left === 0) await this.toast(sent ? `Synced ${sent} item${sent === 1 ? '' : 's'}` : 'All synced', 'success');
    else if (this.outbox.failed().length) await this.toast(`${this.outbox.failed().length} failed. Check the errors below.`, 'danger');
    else await this.toast(`${left} still queued`, 'medium');
  }

  /** An enqueue or a retry may already have started a pass; wait for it. */
  private async settle(): Promise<void> {
    for (let i = 0; i < 150 && this.outbox.syncing(); i++) await new Promise((r) => setTimeout(r, 200));
  }

  // ── Cash ─────────────────────────────────────────────────────────────────

  onCashInput(raw: string): void {
    const clean = raw.replace(/[^\d.]/g, '');
    this.cashCounted.set(clean === '' ? null : Number(clean) || 0);
  }

  fillExpected(): void {
    this.cashCounted.set(this.totals().cashExpected);
  }

  // ── Close ────────────────────────────────────────────────────────────────

  async confirmClose(): Promise<void> {
    if (!this.outbox.isEmpty()) {
      await this.toast('Sync the outbox before closing the day.', 'danger');
      return;
    }
    const counted = this.cashCounted();
    if (counted === null) {
      await this.toast('Enter the cash counted first.', 'danger');
      return;
    }
    const v = this.variance() ?? 0;
    const alert = await this.alertCtrl.create({
      header: 'Close the day?',
      message:
        `Cash counted ${this.money(counted)}` +
        (v !== 0 ? ` (${v > 0 ? '+' : ''}${this.money(v)} variance)` : '') +
        `. ${this.docs.chequesInHand().length} cheques go to treasury. Visit actions lock until a new day.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Close day', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role === 'confirm') await this.close(counted);
  }

  private async close(counted: number): Promise<void> {
    this.closing.set(true);
    try {
      this.tx.closeDay(counted);
    } catch (e) {
      this.closing.set(false);
      await this.toast(e instanceof Error ? e.message : "Couldn't close the day.", 'danger');
      return;
    }
    try {
      await this.outbox.sync();
      await this.settle();
    } finally {
      this.closing.set(false);
    }
    await this.toast(this.outbox.isEmpty() ? 'Day closed and synced' : 'Day closed. Unload syncs when online.', 'success');
  }

  startNewDay(): void {
    this.outbox.clearPosted();
    this.store.startNewDay();
    this.cashCounted.set(null);
    void this.router.navigateByUrl('/inventory/van-sales');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  money(n: number): string {
    return this.format.number(n, 2, 2);
  }

  n(value: number): string {
    return this.format.number(value);
  }

  date(iso: string): string {
    return this.format.date(iso);
  }

  dateTime(iso: string | undefined): string {
    return iso ? this.format.dateTime(iso) : '—';
  }

  private async toast(message: string, color: 'success' | 'danger' | 'medium'): Promise<void> {
    const t = await this.toastCtrl.create({
      message,
      duration: color === 'danger' ? 3000 : 1800,
      position: 'top',
      color,
    });
    await t.present();
  }
}

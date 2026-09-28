import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { FormatService } from '../../../../core';
import { PayMode, round2, VanStoreService, VanTransactionsService } from '../../../../core/van-sales';

const REJECT_REASONS = ['Damaged in transit', 'Customer refused', 'Short on van', 'Wrong item', 'Other'];

/**
 * Deliver a pre-sold order (spec §7.7, F8): delivered quantity per line,
 * a reason when anything is short, payment mode, and the customer's
 * signature as proof of delivery. What is not delivered stays on the van.
 */
@Component({
  selector: 'app-van-deliver',
  templateUrl: './van-deliver.page.html',
  styleUrls: ['./van-deliver.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanDeliverPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly format = inject(FormatService);
  private readonly tx = inject(VanTransactionsService);
  readonly store = inject(VanStoreService);

  readonly reasons = REJECT_REASONS;
  readonly salesId = signal(this.route.snapshot.paramMap.get('salesId') ?? '');

  readonly order = computed(() => this.store.orders().find((o) => o.salesId === this.salesId()) ?? null);
  readonly customer = computed(() => {
    const o = this.order();
    return o ? (this.store.customer(o.customerId) ?? null) : null;
  });
  /** Set once posting starts, so the screen holds while the order flips to Delivered. */
  private readonly submitted = signal(false);
  readonly deliverable = computed(() => this.submitted() || this.order()?.status === 'READY');
  readonly cashOnly = computed(() => this.customer()?.paymentTerms === 'CASH');

  /** itemId → delivered qty. Seeded to the ordered qty once the order is known. */
  readonly delivered = signal<Record<string, number>>({});
  readonly payMode = signal<PayMode>('CASH');
  readonly rejectReason = signal('');
  readonly otherText = signal('');
  readonly signature = signal<string | null>(null);
  readonly posting = signal(false);

  readonly lines = computed(() => {
    const o = this.order();
    if (!o) return [];
    const d = this.delivered();
    return o.lines.map((l) => {
      const qty = d[l.itemId] ?? l.qty;
      const freeQty = l.qty ? Math.floor((l.freeQty * qty) / l.qty) : 0;
      const stock = this.store.stockOf(l.itemId);
      return {
        itemId: l.itemId,
        name: this.store.productName(l.itemId),
        ordered: l.qty,
        freeQty: l.freeQty,
        qty,
        stock,
        stockShort: qty + freeQty > stock,
        unitPrice: l.unitPrice,
      };
    });
  });

  readonly anyShort = computed(() => this.lines().some((l) => l.qty < l.ordered));
  readonly anyStockShort = computed(() => this.lines().some((l) => l.stockShort));
  readonly deliveredQty = computed(() => this.lines().reduce((s, l) => s + l.qty, 0));
  readonly orderedQty = computed(() => this.lines().reduce((s, l) => s + l.ordered, 0));

  /** Preview only — `confirmDelivery` computes the posted figures. */
  readonly totals = computed(() => {
    const o = this.order();
    let net = 0;
    let vat = 0;
    for (const l of o?.lines ?? []) {
      const qty = this.delivered()[l.itemId] ?? l.qty;
      const share = l.qty ? qty / l.qty : 0;
      const lineNet = round2(qty * l.unitPrice - l.lineDiscount * share);
      net = round2(net + lineNet);
      vat = round2(vat + round2((lineNet * this.store.vatPctOf(l.itemId)) / 100));
    }
    return { net, vat, total: round2(net + vat) };
  });

  readonly finalReason = computed(() => {
    if (!this.anyShort()) return '';
    const r = this.rejectReason();
    if (r === 'Other') {
      const t = this.otherText().trim();
      return t ? `Other: ${t}` : '';
    }
    return r;
  });

  readonly blocker = computed<string | null>(() => {
    if (this.store.dayClosed()) return 'Day closed — deliveries are locked.';
    if (this.anyShort() && !this.finalReason()) return 'Pick a reason for the short quantity.';
    if (!this.signature()) return 'Customer signature is required.';
    return null;
  });

  readonly canConfirm = computed(() => this.deliverable() && !this.blocker() && !this.posting());

  async ngOnInit(): Promise<void> {
    await this.store.ensureLoaded();
    const o = this.order();
    if (!o) return;
    this.delivered.set(Object.fromEntries(o.lines.map((l) => [l.itemId, l.qty])));
    this.payMode.set(this.cashOnly() ? 'CASH' : o.payMode);
  }

  step(itemId: string, delta: number): void {
    const line = this.lines().find((l) => l.itemId === itemId);
    if (line) this.setQty(itemId, line.qty + delta);
  }

  onQtyInput(itemId: string, raw: string): void {
    const n = Number(String(raw).replace(/[^\d]/g, ''));
    this.setQty(itemId, Number.isFinite(n) ? n : 0);
  }

  setQty(itemId: string, qty: number): void {
    const line = this.order()?.lines.find((l) => l.itemId === itemId);
    if (!line) return;
    const clamped = Math.max(0, Math.min(line.qty, Math.round(qty)));
    this.delivered.update((d) => ({ ...d, [itemId]: clamped }));
  }

  onSignature(dataUrl: string | null): void {
    this.signature.set(dataUrl);
  }

  async confirm(): Promise<void> {
    const order = this.order();
    const signature = this.signature();
    if (!order || !signature || !this.canConfirm()) return;
    this.posting.set(true);
    this.submitted.set(true);
    try {
      const doc = await this.tx.confirmDelivery({
        order,
        delivered: { ...Object.fromEntries(order.lines.map((l) => [l.itemId, l.qty])), ...this.delivered() },
        rejectReason: this.finalReason() || undefined,
        payMode: this.payMode(),
        signatureDataUrl: signature,
      });
      this.router.navigate(['/inventory/van-sales/receipt', doc.id], { replaceUrl: true });
    } catch (e) {
      this.submitted.set(false);
      await this.toast(e instanceof Error ? e.message : 'Could not confirm the delivery.', 'danger');
    } finally {
      this.posting.set(false);
    }
  }

  back(): void {
    this.router.navigate(['/inventory/van-sales/deliveries']);
  }

  money(n: number): string {
    return this.format.number(n, 2, 2);
  }

  private async toast(message: string, color: 'danger' | 'medium'): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 2200, position: 'top', color });
    await t.present();
  }
}

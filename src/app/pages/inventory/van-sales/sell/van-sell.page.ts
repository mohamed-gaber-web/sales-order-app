import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { catchError, firstValueFrom, of, timeout } from 'rxjs';
import { FormatService } from '../../../../core';
import { BarcodeScannerService } from '../../../../core/services/barcode-scanner.service';
import { DeviceLocationService } from '../../../../core/services/device-location.service';
import { VanDayService } from '../../../../core/services/van-day.service';
import {
  checkCredit,
  describePromotion,
  isPromotionActive,
  localIsoDate,
  NetworkStatusService,
  PayMode,
  PricingResult,
  priceCart,
  Product,
  unitPriceFor,
  VanApprovalService,
  VanDocument,
  VanRoleService,
  VanStoreService,
  VanTransactionsService,
} from '../../../../core/van-sales';

type SellMode = 'invoice' | 'order';

interface StockShort {
  itemId: string;
  name: string;
  need: number;
  have: number;
}

/** Extra-discount choices offered in the select. Anything above the rep's limit needs a supervisor. */
const DISCOUNT_STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Sell (van seller → invoice) or Take order (pre-seller → sales order) for the
 * current visit (spec §7.3). Prices come from the on-device engine, so the
 * summary updates on every tap, offline included; online, D365 re-prices once
 * just before an invoice posts.
 */
@Component({
  selector: 'app-van-sell',
  templateUrl: './van-sell.page.html',
  styleUrls: ['./van-sell.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanSellPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly format = inject(FormatService);
  private readonly day = inject(VanDayService);
  private readonly tx = inject(VanTransactionsService);
  private readonly location = inject(DeviceLocationService);
  private readonly scanner = inject(BarcodeScannerService);
  private readonly network = inject(NetworkStatusService);
  readonly store = inject(VanStoreService);
  readonly role = inject(VanRoleService);
  readonly approvals = inject(VanApprovalService);

  readonly visit = this.day.currentVisit;
  readonly customer = computed(() => {
    const v = this.visit();
    return v ? this.store.customer(v.account) : undefined;
  });

  private readonly orderRequested = signal(false);
  /** A pre-seller always takes orders; a van seller invoices unless asked for an order. */
  readonly mode = computed<SellMode>(() => (this.role.can('SELL') && !this.orderRequested() ? 'invoice' : 'order'));
  readonly allowed = computed(() => this.role.can('SELL') || this.role.can('TAKE_ORDER'));

  readonly payMode = signal<PayMode>('CASH');
  readonly creditOffered = computed(() => this.customer()?.paymentTerms !== 'CASH');
  readonly cart = signal<Record<string, number>>({});
  readonly query = signal('');
  readonly manualPct = signal(0);
  readonly redeem = signal(false);
  readonly shipDate = signal(tomorrow());
  readonly minShipDate = tomorrow();
  readonly posting = signal(false);
  readonly loaded = signal(false);
  readonly canScan = this.scanner.isNative;

  readonly limitPct = computed(() => this.store.repSetup()?.manualDiscountLimitPct ?? 0);
  readonly discountSteps = DISCOUNT_STEPS;

  readonly livePromotions = computed(() => {
    const c = this.customer();
    if (!c) return [];
    const today = localIsoDate();
    return this.store
      .promotions()
      .filter((r) => isPromotionActive(r, today, c.priceGroup))
      .map((r) => ({ id: r.id, name: r.name, text: describePromotion(r) }));
  });

  readonly products = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.store.products();
    if (!q) return all;
    return all.filter(
      (p) => p.name.toLowerCase().includes(q) || p.itemId.toLowerCase().includes(q) || (p.barcode ?? '').includes(q)
    );
  });

  readonly cartCount = computed(() => Object.values(this.cart()).filter((q) => q > 0).length);

  readonly customerPoints = computed(() => this.customer()?.loyalty?.points ?? 0);
  readonly canRedeem = computed(() => {
    const loyalty = this.store.master()?.loyalty;
    return !!loyalty && loyalty.redeemValuePerPoint > 0 && this.customerPoints() >= Math.max(1, loyalty.minRedeemPoints);
  });

  readonly pricing = computed<PricingResult | null>(() => {
    const c = this.customer();
    const m = this.store.master();
    if (!c || !m) return null;
    const lines = Object.entries(this.cart())
      .filter(([, q]) => q > 0)
      .map(([itemId, qty]) => ({ itemId, qty, unit: m.products.find((p) => p.itemId === itemId)?.unit ?? '' }));
    return priceCart({
      lines,
      customer: { id: c.id, priceGroup: c.priceGroup },
      products: m.products,
      prices: m.prices,
      promotions: m.promotions,
      taxGroups: m.taxGroups,
      today: localIsoDate(),
      manualDiscountPct: this.manualPct(),
      redeemPoints: this.redeem() && this.canRedeem() ? this.customerPoints() : 0,
      customerPoints: this.customerPoints(),
      loyalty: m.loyalty,
      groupFactors: m.priceGroupFactors,
    });
  });

  readonly freeItemsCount = computed(() => (this.pricing()?.freeGoods ?? []).reduce((s, f) => s + f.qty, 0));

  // ── Blocking issues ──────────────────────────────────────────────────────

  readonly stockShort = computed<StockShort[]>(() => {
    const p = this.pricing();
    if (this.mode() !== 'invoice' || !p) return [];
    const need = new Map<string, number>();
    for (const l of p.lines) need.set(l.itemId, (need.get(l.itemId) ?? 0) + l.qty);
    for (const f of p.freeGoods) need.set(f.itemId, (need.get(f.itemId) ?? 0) + f.qty);
    const short: StockShort[] = [];
    for (const [itemId, n] of need) {
      const have = this.store.stockOf(itemId);
      if (n > have) short.push({ itemId, name: this.store.productName(itemId), need: n, have });
    }
    return short;
  });

  readonly discountApproval = computed(() => {
    const c = this.customer();
    if (!c) return undefined;
    const a = this.approvals.approved(c.id, 'EXTRA_DISCOUNT');
    const pct = Number((a?.payload as { pct?: number } | undefined)?.pct ?? 0);
    return a && pct >= this.manualPct() ? a : undefined;
  });
  readonly discountPending = computed(() => {
    const c = this.customer();
    return c ? this.approvals.pending(c.id, 'EXTRA_DISCOUNT') : undefined;
  });
  readonly discountOverLimit = computed(() => this.manualPct() > this.limitPct() && !this.discountApproval());

  readonly creditApproval = computed(() => {
    const c = this.customer();
    return c ? this.approvals.approved(c.id, 'CREDIT_OVERRIDE') : undefined;
  });
  readonly creditPending = computed(() => {
    const c = this.customer();
    return c ? this.approvals.pending(c.id, 'CREDIT_OVERRIDE') : undefined;
  });
  readonly credit = computed(() => {
    const c = this.customer();
    const p = this.pricing();
    if (!c || !p || this.payMode() !== 'CREDIT' || !p.lines.length) return null;
    return checkCredit(c, p.total, !!this.creditApproval());
  });
  readonly creditIssue = computed(() => {
    const r = this.credit();
    if (!r || r.ok) return null;
    // A seller is told credit is blocked and why, never by how much.
    if (!this.role.seesBalance() && r.block === 'OVER_LIMIT') return 'This sale is over the customer’s credit limit.';
    return r.message ?? 'Credit is blocked.';
  });

  readonly canPost = computed(
    () =>
      !this.store.dayClosed() &&
      !this.posting() &&
      !!this.pricing()?.lines.length &&
      !this.stockShort().length &&
      !this.discountOverLimit() &&
      !this.creditIssue()
  );

  readonly ctaLabel = computed(() => {
    const total = this.pricing()?.total ?? 0;
    const verb = this.mode() === 'invoice' ? 'Post invoice' : 'Place order';
    return total > 0 ? `${verb} · ${this.money(total)}` : verb;
  });

  async ngOnInit(): Promise<void> {
    this.orderRequested.set(this.route.snapshot.queryParamMap.get('mode') === 'order');
    if (!this.visit()) {
      const id = Number(this.route.snapshot.paramMap.get('id'));
      if (Number.isFinite(id)) this.day.setCurrentVisit(id);
    }
    if (!this.visit()) {
      this.router.navigate(['/inventory/van-sales']);
      return;
    }
    await this.store.ensureLoaded();
    const c = this.customer();
    this.payMode.set(c?.paymentTerms === 'CREDIT' ? 'CREDIT' : 'CASH');
    this.loaded.set(true);
  }

  // ── Cart ─────────────────────────────────────────────────────────────────

  qtyOf(itemId: string): number {
    return this.cart()[itemId] ?? 0;
  }

  setQty(itemId: string, qty: number): void {
    const q = Math.max(0, Math.floor(Number.isFinite(qty) ? qty : 0));
    this.cart.update((c) => ({ ...c, [itemId]: q }));
  }

  step(p: Product, delta: number): void {
    this.setQty(p.itemId, this.qtyOf(p.itemId) + delta);
  }

  onQtyInput(itemId: string, value: string): void {
    this.setQty(itemId, Number(String(value).replace(/[^\d]/g, '')));
  }

  priceOf(itemId: string): number {
    const c = this.customer();
    const m = this.store.master();
    if (!c || !m) return 0;
    return unitPriceFor(itemId, c.priceGroup, m.products, m.prices, m.priceGroupFactors);
  }

  lineOf(itemId: string) {
    return this.pricing()?.lines.find((l) => l.itemId === itemId);
  }

  promoNote(itemId: string): string {
    const l = this.lineOf(itemId);
    if (!l?.promoLabel) return '';
    return l.freeItemId ? `${l.promoLabel} (${this.store.productName(l.freeItemId)})` : l.promoLabel;
  }

  onSearch(q: string): void {
    this.query.set(q);
    // A keyboard-wedge scanner types the whole barcode at once: add one straight away.
    const hit = q.length >= 8 ? this.store.products().find((p) => p.barcode === q) : undefined;
    if (hit) this.addScanned(hit);
  }

  async scan(): Promise<void> {
    try {
      const result = await this.scanner.scanNative();
      if (!result) return;
      const hit = this.store.products().find((p) => p.barcode === result.rawValue || p.itemId === result.rawValue);
      if (hit) this.addScanned(hit);
      else void this.toast(`No product with barcode ${result.rawValue}`, 'warning');
    } catch (e) {
      void this.toast(e instanceof Error ? e.message : 'Scan failed', 'warning');
    }
  }

  private addScanned(p: Product): void {
    this.step(p, 1);
    void this.toast(`${p.name} · ${this.qtyOf(p.itemId)}`, 'success');
  }

  // ── Payment & approvals ──────────────────────────────────────────────────

  setPayMode(mode: PayMode): void {
    if (mode === 'CREDIT' && !this.creditOffered()) return;
    this.payMode.set(mode);
  }

  onDiscount(value: unknown): void {
    this.manualPct.set(Number(value) || 0);
  }

  requestDiscount(): void {
    const c = this.customer();
    if (!c || this.discountPending()) return;
    const pct = this.manualPct();
    const total = this.pricing()?.total ?? 0;
    this.approvals.request('EXTRA_DISCOUNT', c.id, `Extra discount ${pct}% (limit ${this.limitPct()}%) on ${this.money(total)}`, {
      pct,
    });
    void this.toast('Sent to supervisor', 'medium');
  }

  requestCreditOverride(): void {
    const c = this.customer();
    if (!c || this.creditPending()) return;
    const total = this.pricing()?.total ?? 0;
    this.approvals.request('CREDIT_OVERRIDE', c.id, `Credit sale of ${this.money(total)} — ${this.creditIssue() ?? ''}`.trim(), {
      amount: total,
    });
    void this.toast('Sent to supervisor', 'medium');
  }

  // ── Post ─────────────────────────────────────────────────────────────────

  async post(): Promise<void> {
    const c = this.customer();
    const pricing = this.pricing();
    if (!c || !pricing || !this.canPost()) return;
    this.posting.set(true);
    try {
      let doc: VanDocument;
      if (this.mode() === 'invoice') {
        if (this.network.online()) {
          const d365 = await firstValueFrom(
            this.tx.verifyPricing(c, pricing).pipe(
              timeout(8000),
              catchError(() => of(null))
            )
          );
          if (d365 && Math.abs(d365.total - pricing.total) > 0.01) {
            void this.toast(`D365 prices this at ${this.money(d365.total)} — it will re-validate.`, 'warning');
          }
        }
        const position = await firstValueFrom(
          this.location.getCurrent().pipe(
            timeout(4000),
            catchError(() => of(null))
          )
        );
        const creditBlockedWithout = this.payMode() === 'CREDIT' && !checkCredit(c, pricing.total, false).ok;
        doc = this.tx.postInvoice({
          customer: c,
          pricing,
          payMode: this.payMode(),
          discountApprovalId: this.manualPct() > this.limitPct() ? this.discountApproval()?.id : undefined,
          creditApprovalId: creditBlockedWithout ? this.creditApproval()?.id : undefined,
          position,
        });
      } else {
        doc = this.tx.createOrder({
          customer: c,
          pricing,
          payMode: this.payMode(),
          requestedShipDate: this.shipDate() || tomorrow(),
          discountApprovalId: this.manualPct() > this.limitPct() ? this.discountApproval()?.id : undefined,
          creditApprovalId:
            this.payMode() === 'CREDIT' && !checkCredit(c, pricing.total, false).ok ? this.creditApproval()?.id : undefined,
        });
      }
      this.cart.set({});
      this.manualPct.set(0);
      this.redeem.set(false);
      await this.router.navigate(['/inventory/van-sales/receipt', doc.id], { replaceUrl: true });
    } catch (e) {
      void this.toast(e instanceof Error ? e.message : 'Could not post', 'danger');
    } finally {
      this.posting.set(false);
    }
  }

  // ── View helpers ─────────────────────────────────────────────────────────

  money(n: number): string {
    return this.format.number(n, 2, 2);
  }

  num(n: number): string {
    return this.format.number(n);
  }

  private async toast(message: string, color: 'success' | 'medium' | 'warning' | 'danger'): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 2200, position: 'top', color });
    await t.present();
  }
}

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

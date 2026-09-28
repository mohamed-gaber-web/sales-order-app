import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { VanDayService } from '../../../../core/services/van-day.service';
import { FormatService } from '../../../../core';
import {
  Disposition,
  DocumentLine,
  freeReturnPrice,
  ReturnInput,
  returnDestination,
  unitPriceFor,
  VanApprovalService,
  VanDocumentsService,
  VanRoleService,
  VanStoreService,
  VanTransactionsService,
} from '../../../../core/van-sales';

type ReturnMode = ReturnInput['type'];

/** An invoice the rep can return against. `lines` only for documents issued on this device. */
interface InvoiceOption {
  id: string;
  date: string;
  amount: number;
  lines?: DocumentLine[];
}

interface ReturnLine {
  itemId: string;
  name: string;
  qty: number;
  price: number;
  /** Invoiced quantity — the cap for a return against a document with line detail. */
  maxQty?: number;
}

const DISPOSITION_LABEL: Record<Disposition, string> = {
  RESTOCK: 'Restock',
  QUARANTINE: 'Quarantine',
  SCRAP: 'Scrap',
};

/**
 * Returns (spec §7.5, §8.4) — against one of the customer's invoices, or a
 * free return of any product at the customer's last purchase price. A free
 * return over the per-visit limit goes to the supervisor and posts itself on
 * approval. Sellable reasons put stock back on the van; the rest go to the
 * damaged bucket for unload.
 */
@Component({
  selector: 'app-van-return',
  templateUrl: './van-return.page.html',
  styleUrls: ['./van-return.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanReturnPage implements OnInit {
  private readonly format = inject(FormatService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly tx = inject(VanTransactionsService);
  private readonly docs = inject(VanDocumentsService);
  private readonly approvals = inject(VanApprovalService);
  readonly store = inject(VanStoreService);
  readonly role = inject(VanRoleService);
  readonly day = inject(VanDayService);

  readonly visit = this.day.currentVisit;
  readonly customer = computed(() => {
    const v = this.visit();
    return v ? this.store.customer(v.account) : undefined;
  });

  readonly mode = signal<ReturnMode>('AgainstInvoice');
  readonly invoiceId = signal('');
  readonly lines = signal<ReturnLine[]>([]);
  readonly reasonCode = signal('');
  readonly query = signal('');
  readonly isPosting = signal(false);

  readonly canFreeReturn = computed(() => this.role.can('FREE_RETURN'));

  readonly invoiceOptions = computed<InvoiceOption[]>(() => {
    const c = this.customer();
    if (!c) return [];
    const local: InvoiceOption[] = this.docs
      .todays()
      .filter((d) => d.customerId === c.id && (d.type === 'INVOICE' || d.type === 'DELIVERY') && d.lines.length)
      .map((d) => ({ id: d.id, date: d.createdAt.slice(0, 10), amount: d.total, lines: d.lines }));
    const seen = new Set(local.map((o) => o.id));
    const open = c.openInvoices
      .filter((i) => i.amount > 0 && !seen.has(i.invoiceId))
      .map((i) => ({ id: i.invoiceId, date: i.date, amount: i.amount }));
    return [...local, ...open];
  });

  readonly selectedInvoice = computed(() => this.invoiceOptions().find((o) => o.id === this.invoiceId()));

  /** Against an invoice with line detail the lines are fixed; otherwise the rep adds products. */
  readonly canAddProducts = computed(
    () => this.mode() === 'Free' || (!!this.selectedInvoice() && !this.selectedInvoice()?.lines)
  );

  readonly searchResults = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(this.lines().map((l) => l.itemId));
    return this.store
      .products()
      .filter((p) => !taken.has(p.itemId))
      .filter((p) => p.name.toLowerCase().includes(q) || p.itemId.includes(q) || (p.barcode ?? '').includes(q))
      .slice(0, 8);
  });

  readonly reason = computed(() => this.store.reasons().find((r) => r.code === this.reasonCode()));
  readonly destination = computed(() => {
    const r = this.reason();
    return r ? returnDestination(r) : null;
  });

  readonly postLines = computed(() =>
    this.lines()
      .filter((l) => l.qty > 0)
      .map((l) => ({ itemId: l.itemId, qty: l.qty, price: l.price }))
  );

  readonly value = computed(() => this.tx.returnValue(this.postLines()));
  readonly limit = computed(() => this.store.repSetup()?.freeReturnLimitPerVisit ?? 0);

  readonly pendingApproval = computed(() => {
    const c = this.customer();
    return c ? this.approvals.pending(c.id, 'FREE_RETURN') : undefined;
  });
  readonly approvedApproval = computed(() => {
    const c = this.customer();
    return c ? this.approvals.approved(c.id, 'FREE_RETURN') : undefined;
  });

  readonly needsApproval = computed(
    () => this.mode() === 'Free' && this.value() > this.limit() && !this.approvedApproval()
  );

  readonly blocker = computed(() => {
    if (this.store.dayClosed()) return 'The day is closed.';
    if (this.mode() === 'AgainstInvoice' && !this.selectedInvoice()) return 'Pick the invoice.';
    if (!this.postLines().length) return 'Add at least one item.';
    if (!this.reason()) return 'Pick a reason.';
    return '';
  });

  readonly canPost = computed(
    () => !this.blocker() && !this.isPosting() && !this.pendingApproval() && !!this.customer()
  );

  readonly ctaLabel = computed(() => {
    if (this.store.dayClosed()) return 'Day closed';
    if (this.pendingApproval()) return 'Waiting for supervisor';
    if (this.needsApproval()) return 'Request supervisor approval';
    return 'Post return';
  });

  readonly dispositionLabel = DISPOSITION_LABEL;

  constructor() {
    // A free return approved while this screen is open posts itself — follow it to the receipt.
    const seen = this.tx.autoPosted()?.id;
    effect(() => {
      const doc = this.tx.autoPosted();
      if (!doc || doc.id === seen) return;
      untracked(() => {
        if (doc.customerId !== this.customer()?.id) return;
        void this.toast(`Approved — return ${doc.id} posted`, 'success');
        this.router.navigate(['/inventory/van-sales/receipt', doc.id], { replaceUrl: true });
      });
    });
  }

  ngOnInit() {
    if (!this.visit()) {
      const id = Number(this.route.snapshot.paramMap.get('id'));
      if (Number.isFinite(id)) this.day.setCurrentVisit(id);
    }
    if (!this.visit()) {
      this.router.navigate(['/inventory/van-sales']);
      return;
    }
    const first = this.invoiceOptions()[0];
    if (first) this.selectInvoice(first.id);
  }

  setMode(mode: ReturnMode) {
    if (mode === this.mode()) return;
    if (mode === 'Free' && !this.canFreeReturn()) return;
    this.mode.set(mode);
    this.query.set('');
    if (mode === 'Free') {
      this.lines.set([]);
    } else {
      const inv = this.selectedInvoice() ?? this.invoiceOptions()[0];
      if (inv) this.selectInvoice(inv.id);
      else this.lines.set([]);
    }
  }

  selectInvoice(id: string) {
    this.invoiceId.set(id);
    const inv = this.invoiceOptions().find((o) => o.id === id);
    this.lines.set(
      (inv?.lines ?? [])
        .filter((l) => l.qty > 0)
        .map((l) => ({ itemId: l.itemId, name: l.name, qty: 0, price: l.unitPrice, maxQty: l.qty }))
    );
  }

  addProduct(itemId: string) {
    const c = this.customer();
    const m = this.store.master();
    if (!c || !m) return;
    const list = unitPriceFor(itemId, c.priceGroup, m.products, m.prices, m.priceGroupFactors);
    const price = this.mode() === 'Free' ? freeReturnPrice(m.lastPrices, c.id, itemId, list) : list;
    this.lines.update((ls) => [...ls, { itemId, name: this.store.productName(itemId), qty: 1, price }]);
    this.query.set('');
  }

  removeLine(itemId: string) {
    this.lines.update((ls) => ls.filter((l) => l.itemId !== itemId));
  }

  step(itemId: string, delta: number) {
    const l = this.lines().find((x) => x.itemId === itemId);
    if (l) this.setQty(itemId, l.qty + delta);
  }

  setQty(itemId: string, raw: string | number | null) {
    const n = Math.floor(Number(raw ?? 0));
    this.lines.update((ls) =>
      ls.map((l) => {
        if (l.itemId !== itemId) return l;
        const capped = Math.max(0, Number.isFinite(n) ? n : 0);
        return { ...l, qty: l.maxQty !== undefined ? Math.min(l.maxQty, capped) : capped };
      })
    );
  }

  lineValue(l: ReturnLine): number {
    return this.tx.returnValue([{ itemId: l.itemId, qty: l.qty, price: l.price }]);
  }

  submit() {
    const c = this.customer();
    const reason = this.reason();
    if (!c || !reason || !this.canPost()) return;

    const input: ReturnInput = {
      customerId: c.id,
      type: this.mode(),
      originalInvoice: this.mode() === 'AgainstInvoice' ? this.invoiceId() : undefined,
      reasonCode: reason.code,
      lines: this.postLines(),
    };

    if (this.needsApproval()) {
      this.tx.requestFreeReturnApproval(input);
      void this.toast('Sent to your supervisor', 'medium');
      return;
    }

    this.isPosting.set(true);
    try {
      const approval = this.mode() === 'Free' ? this.approvedApproval() : undefined;
      const doc = this.tx.postReturn({ ...input, approvalId: approval?.id });
      this.isPosting.set(false);
      this.router.navigate(['/inventory/van-sales/receipt', doc.id], { replaceUrl: true });
    } catch (e) {
      this.isPosting.set(false);
      void this.toast(e instanceof Error ? e.message : "Couldn't save the return. Try again.", 'danger');
    }
  }

  money(n: number): string {
    return this.format.number(n, 2, 2);
  }

  private async toast(message: string, color: 'success' | 'danger' | 'medium') {
    const toast = await this.toastCtrl.create({ message, duration: 2600, position: 'top', color });
    await toast.present();
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Camera, CameraResultType } from '@capacitor/camera';
import { VanDayService } from '../../../../core/services/van-day.service';
import { FormatService } from '../../../../core';
import {
  PaymentMethod,
  round2,
  settleOldestFirst,
  validateCheques,
  VanStoreService,
  VanTransactionsService,
  VanRoleService,
} from '../../../../core/van-sales';

/** A cheque card while it is being filled in. `key` keeps the @for stable. */
interface ChequeDraft {
  key: number;
  bank: string;
  number: string;
  dueDate: string;
  amount: number;
  photoDataUrl?: string;
}

/**
 * Collect against the customer's open invoices (spec §7.4, §8.3) — cash,
 * post-dated cheques or e-wallet. The amount is settled oldest invoice first
 * and previewed live; posting goes through `VanTransactionsService`, which
 * queues #29 once, #30 once with every cheque, and #38 per cheque photo.
 */
@Component({
  selector: 'app-van-collect',
  templateUrl: './van-collect.page.html',
  styleUrls: ['./van-collect.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanCollectPage implements OnInit {
  private readonly format = inject(FormatService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly tx = inject(VanTransactionsService);
  readonly store = inject(VanStoreService);
  readonly day = inject(VanDayService);
  /** Sellers collect without seeing the balance, invoice amounts or balance after. */
  readonly role = inject(VanRoleService);

  readonly visit = this.day.currentVisit;
  readonly customer = computed(() => {
    const v = this.visit();
    return v ? this.store.customer(v.account) : undefined;
  });

  readonly method = signal<PaymentMethod>('CASH');
  readonly amount = signal(0);
  readonly walletRef = signal('');
  readonly cheques = signal<ChequeDraft[]>([this.blankCheque(1)]);
  readonly isPosting = signal(false);
  private nextKey = 2;

  readonly balance = computed(() => {
    const c = this.customer();
    return c ? this.store.balanceOf(c.id) : 0;
  });

  readonly chequeCheck = computed(() =>
    validateCheques(
      this.cheques().map(({ bank, number, dueDate, amount }) => ({ bank, number, dueDate, amount })),
      this.balance()
    )
  );

  /** What is actually being collected, whichever method is on. */
  readonly collectAmount = computed(() =>
    this.method() === 'PDC' ? this.chequeCheck().total : round2(this.amount() || 0)
  );

  readonly amountError = computed(() => {
    if (this.method() === 'PDC') return '';
    const a = this.collectAmount();
    if (!(a > 0)) return 'Enter an amount.';
    if (a > round2(this.balance())) return this.role.seesBalance() ? 'More than the open balance.' : 'More than the customer owes.';
    return '';
  });

  readonly walletError = computed(() =>
    this.method() === 'E_WALLET' && !this.walletRef().trim() ? 'Wallet reference is required.' : ''
  );

  readonly settlement = computed(() => {
    const c = this.customer();
    return c ? settleOldestFirst(c.openInvoices, this.collectAmount()) : [];
  });

  readonly balanceAfter = computed(() => round2(Math.max(0, this.balance() - this.collectAmount())));

  readonly canPost = computed(() => {
    if (this.isPosting() || this.store.dayClosed() || !this.customer()) return false;
    if (this.method() === 'PDC') return this.chequeCheck().ok && this.collectAmount() > 0;
    return !this.amountError() && !this.walletError();
  });

  ngOnInit() {
    if (!this.visit()) {
      const id = Number(this.route.snapshot.paramMap.get('id'));
      if (Number.isFinite(id)) this.day.setCurrentVisit(id);
    }
    const v = this.visit();
    if (!v) {
      this.router.navigate(['/inventory/van-sales']);
      return;
    }
    void this.tx.refreshCustomer(v.account);
  }

  setMethod(method: PaymentMethod) {
    this.method.set(method);
  }

  setAmount(raw: string | number | null) {
    const n = Number(String(raw ?? '').replace(/[^0-9.]/g, ''));
    this.amount.set(Number.isFinite(n) ? Math.max(0, round2(n)) : 0);
  }

  payHalf() {
    this.amount.set(round2(this.balance() / 2));
  }

  payFull() {
    this.amount.set(round2(this.balance()));
  }

  // ── Cheques ──────────────────────────────────────────────────────────────

  addCheque() {
    this.cheques.update((list) => [...list, this.blankCheque(this.nextKey++)]);
  }

  removeCheque(key: number) {
    this.cheques.update((list) => list.filter((c) => c.key !== key));
  }

  patchCheque(key: number, patch: Partial<ChequeDraft>) {
    this.cheques.update((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  setChequeAmount(key: number, raw: string | number | null) {
    const n = Number(String(raw ?? '').replace(/[^0-9.]/g, ''));
    this.patchCheque(key, { amount: Number.isFinite(n) ? Math.max(0, round2(n)) : 0 });
  }

  /** Sets this cheque to whatever the other cheques leave of the balance. */
  fillRemaining(key: number) {
    const others = this.cheques()
      .filter((c) => c.key !== key)
      .reduce((s, c) => s + (c.amount > 0 ? c.amount : 0), 0);
    this.patchCheque(key, { amount: round2(Math.max(0, this.balance() - others)) });
  }

  async takePhoto(key: number) {
    try {
      const photo = await Camera.getPhoto({ resultType: CameraResultType.DataUrl, quality: 60 });
      if (photo.dataUrl) this.patchCheque(key, { photoDataUrl: photo.dataUrl });
    } catch {
      // Cancelled, or no camera on this platform — the photo is optional.
    }
  }

  removePhoto(key: number) {
    this.patchCheque(key, { photoDataUrl: undefined });
  }

  // ── Post ─────────────────────────────────────────────────────────────────

  async post() {
    const customer = this.customer();
    if (!customer || !this.canPost()) return;
    const method = this.method();
    this.isPosting.set(true);
    try {
      const doc = await this.tx.postCollection({
        customer,
        method,
        amount: this.collectAmount(),
        settlement: this.settlement()
          .filter((s) => s.applied > 0)
          .map((s) => ({ invoiceId: s.invoiceId, amount: s.applied })),
        cheques:
          method === 'PDC'
            ? this.cheques().map((c) => ({
                bank: c.bank,
                number: c.number.trim(),
                dueDate: c.dueDate,
                amount: c.amount,
                photoDataUrl: c.photoDataUrl,
              }))
            : undefined,
        walletRef: method === 'E_WALLET' ? this.walletRef().trim() : undefined,
      });
      this.isPosting.set(false);
      this.router.navigate(['/inventory/van-sales/receipt', doc.id], { replaceUrl: true });
    } catch {
      this.isPosting.set(false);
      this.toast("Couldn't save the collection. Try again.", 'danger');
    }
  }

  ctaLabel(): string {
    if (this.store.dayClosed()) return 'Day closed';
    const a = this.collectAmount();
    return a > 0 ? `Collect ${this.money(a)}` : 'Collect';
  }

  money(n: number): string {
    return this.format.number(n, 2, 2);
  }

  private blankCheque(key: number): ChequeDraft {
    return { key, bank: '', number: '', dueDate: '', amount: 0 };
  }

  private async toast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({ message, duration: 3000, position: 'top', color });
    await toast.present();
  }
}

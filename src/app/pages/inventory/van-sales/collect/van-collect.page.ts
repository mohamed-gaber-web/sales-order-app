import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { VanDayService } from '../../../../core/services/van-day.service';
import { VanFieldOpsService } from '../../../../core/services/van-field-ops.service';

type CollectMethod = 'Cash' | 'Cheque';

/**
 * Collect a payment against the customer's open invoices. The amount is settled
 * oldest-invoice-first, previewed live, and posted through
 * `GPCollectionService/postPayment` (scaffolded) before the day's books update.
 */
@Component({
  selector: 'app-van-collect',
  templateUrl: './van-collect.page.html',
  styleUrls: ['./van-collect.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanCollectPage implements OnInit {
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private fieldOps = inject(VanFieldOpsService);
  readonly day = inject(VanDayService);

  readonly visit = this.day.currentVisit;
  readonly method = signal<CollectMethod>('Cash');
  readonly amount = signal(0);
  readonly isPosting = signal(false);

  readonly balance = computed(() => this.visit()?.balance ?? 0);

  /** Live oldest-first settlement of the typed amount across open invoices. */
  readonly settlement = computed(() => {
    let remaining = this.amount();
    return this.day.openInvoices()
      .filter((inv) => inv.open > 0)
      .map((inv) => {
        const applied = Math.max(0, Math.min(inv.open, remaining));
        remaining -= applied;
        return { invoiceId: inv.invoiceId, date: inv.date, open: inv.open, applied };
      });
  });

  readonly balanceAfter = computed(() => Math.max(0, this.balance() - this.amount()));

  readonly canPost = computed(
    () => this.amount() > 0 && this.amount() <= this.balance() && !this.isPosting()
  );

  ngOnInit() {
    if (!this.visit()) {
      this.router.navigate(['/inventory/van-sales']);
      return;
    }
    // Seed with a sensible default the driver can adjust.
    this.amount.set(Math.min(5000, this.balance()));
  }

  setMethod(method: CollectMethod) {
    this.method.set(method);
  }

  onAmountInput(raw: string | number) {
    const n = Math.max(0, Math.floor(Number(String(raw).replace(/[^0-9.]/g, ''))) || 0);
    this.amount.set(Math.min(n, this.balance()));
  }

  payHalf() {
    this.amount.set(Math.round(this.balance() / 2));
  }

  payFull() {
    this.amount.set(this.balance());
  }

  post() {
    const v = this.visit();
    if (!v || !this.canPost()) return;

    this.isPosting.set(true);
    const settle = this.settlement()
      .filter((s) => s.applied > 0)
      .map((s) => ({ invoiceId: s.invoiceId, amount: s.applied }));

    this.fieldOps
      .postPayment({
        customerAccount: v.account,
        method: this.method(),
        amount: this.amount(),
        settle,
      })
      .subscribe({
        next: (result) => {
          this.day.applyCollection(this.amount());
          this.isPosting.set(false);
          this.toast(`Collected — voucher ${result.voucher}`, 'success');
          this.router.navigate(['/inventory/van-sales/visit', v.id]);
        },
        error: () => {
          this.isPosting.set(false);
          this.toast("Couldn't post the collection. Try again.", 'danger');
        },
      });
  }

  round(n: number): string {
    return Math.round(n).toLocaleString('en-US');
  }

  private async toast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({
      message,
      duration: color === 'success' ? 1800 : 3000,
      position: 'top',
      color,
    });
    await toast.present();
  }
}

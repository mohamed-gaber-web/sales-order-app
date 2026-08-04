import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { VanDayService } from '../../../../core/services/van-day.service';
import { VanFieldOpsService } from '../../../../core/services/van-field-ops.service';

type ReturnType = 'Full' | 'Partial';

/** VAT rate applied to the reversed amount (KSA standard rate). */
const VAT_RATE = 0.15;
/** Representative per-unit value of the returned line, pending real invoice lookup. */
const UNIT_VALUE = 96;
const FULL_QTY = 10;

/**
 * Record a return against the customer's original invoice. A return is always
 * tied to a real posted invoice (the service validates it), reverses only the
 * returned portion, and posts through `GPReturnService/postReturn` (scaffolded)
 * — which issues a credit note with its own ZATCA QR.
 */
@Component({
  selector: 'app-van-return',
  templateUrl: './van-return.page.html',
  styleUrls: ['./van-return.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanReturnPage implements OnInit {
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private fieldOps = inject(VanFieldOpsService);
  readonly day = inject(VanDayService);

  readonly visit = this.day.currentVisit;
  readonly type = signal<ReturnType>('Partial');
  readonly qty = signal(3);
  readonly isPosting = signal(false);

  /** Original invoices this return can be booked against (customer's open ones). */
  readonly originalInvoices = computed(() => this.day.openInvoices());
  readonly selectedInvoice = signal<string>('');

  readonly returnedQty = computed(() => (this.type() === 'Full' ? FULL_QTY : this.qty()));
  readonly netValue = computed(() => this.returnedQty() * UNIT_VALUE);
  readonly valueWithVat = computed(() => this.netValue() * (1 + VAT_RATE));

  readonly canPost = computed(
    () => !!this.selectedInvoice() && this.returnedQty() > 0 && !this.isPosting()
  );

  ngOnInit() {
    if (!this.visit()) {
      this.router.navigate(['/inventory/van-sales']);
      return;
    }
    this.selectedInvoice.set(this.originalInvoices()[0]?.invoiceId ?? '');
  }

  setType(type: ReturnType) {
    this.type.set(type);
  }

  selectInvoice(invoiceId: string) {
    this.selectedInvoice.set(invoiceId);
  }

  adjustQty(delta: number) {
    this.qty.set(Math.max(1, Math.min(FULL_QTY, this.qty() + delta)));
  }

  post() {
    const v = this.visit();
    if (!v || !this.canPost()) return;

    this.isPosting.set(true);
    this.fieldOps
      .postReturn({
        customerAccount: v.account,
        originalInvoiceId: this.selectedInvoice(),
        returnType: this.type(),
        reasonCode: 'RTN-DMG',
        disposition: 'Damaged',
        lines: [{ itemNumber: 'P-1002', unit: 'CTN', qty: this.returnedQty() }],
      })
      .subscribe({
        next: (result) => {
          this.day.applyReturn(this.valueWithVat());
          this.isPosting.set(false);
          this.toast(`Return posted — credit note ${result.creditNoteId}`, 'success');
          this.router.navigate(['/inventory/van-sales/visit', v.id]);
        },
        error: () => {
          this.isPosting.set(false);
          this.toast("Couldn't post the return. Try again.", 'danger');
        },
      });
  }

  money(n: number): string {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

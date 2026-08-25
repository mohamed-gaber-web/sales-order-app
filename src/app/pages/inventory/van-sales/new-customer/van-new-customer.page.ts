import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { VanDayService } from '../../../../core/services/van-day.service';
import { VanFieldOpsService } from '../../../../core/services/van-field-ops.service';

type PaymentMode = 'COD' | 'Credit';

/** The three documents a new account needs before Finance can approve it. */
const REQUIRED_DOCS = ['Commercial registration', 'Tax card', 'National address'] as const;
type RequiredDoc = (typeof REQUIRED_DOCS)[number];

/**
 * Submit a request to onboard a new customer.
 *
 * On submit this posts `POST /data/CustomerPaymentJournalHeaders`, opening a
 * `CustPay` journal batch. That is what was specified, and it is worth stating
 * plainly what it does and does not do: it creates an empty payment batch. The
 * form's name, phone, tax number and attachments are validated here but are not
 * carried by that entity, and no customer account is created — onboarding is
 * `CustomersV3` plus `GPCustomerRequestService/submit`, still scaffolded on
 * `VanFieldOpsService.submitCustomerRequest`.
 */
@Component({
  selector: 'app-van-new-customer',
  templateUrl: './van-new-customer.page.html',
  styleUrls: ['./van-new-customer.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanNewCustomerPage {
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private fieldOps = inject(VanFieldOpsService);
  private day = inject(VanDayService);

  readonly docs = REQUIRED_DOCS;

  readonly name = signal('');
  readonly phone = signal('');
  readonly taxNumber = signal('');
  readonly address = signal('');
  readonly gpsCaptured = signal(false);
  readonly paymentMode = signal<PaymentMode>('COD');
  readonly attached = signal<ReadonlySet<RequiredDoc>>(new Set());
  readonly isPosting = signal(false);

  readonly allAttached = computed(() => this.attached().size === REQUIRED_DOCS.length);

  readonly canSubmit = computed(
    () =>
      this.name().trim().length > 0 &&
      this.phone().trim().length > 0 &&
      this.taxNumber().trim().length > 0 &&
      this.allAttached() &&
      !this.isPosting()
  );

  setMode(mode: PaymentMode) {
    this.paymentMode.set(mode);
  }

  captureGps() {
    this.gpsCaptured.set(true);
  }

  isAttached(doc: RequiredDoc): boolean {
    return this.attached().has(doc);
  }

  toggleDoc(doc: RequiredDoc) {
    this.attached.update((set) => {
      const next = new Set(set);
      if (next.has(doc)) next.delete(doc);
      else next.add(doc);
      return next;
    });
  }

  submit() {
    if (!this.canSubmit()) return;

    this.isPosting.set(true);
    this.fieldOps.createPaymentJournalHeader().subscribe({
      next: (header) => {
        this.day.addCustomerRequest();
        this.isPosting.set(false);
        const batch = header?.JournalBatchNumber;
        this.toast(
          batch ? `Payment journal ${batch} created` : 'Payment journal created',
          'success'
        );
        this.router.navigate(['/inventory/van-sales']);
      },
      error: () => {
        this.isPosting.set(false);
        this.toast("Couldn't create the payment journal. Try again.", 'danger');
      },
    });
  }

  private async toast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({
      message,
      duration: color === 'success' ? 2200 : 3000,
      position: 'top',
      color,
    });
    await toast.present();
  }
}

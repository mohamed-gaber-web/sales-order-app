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
 * Submit a request to onboard a new customer. The request goes to Finance for
 * credit review via `GPCustomerRequestService/submit` (scaffolded); the account
 * is created on hold and released once approved. Attachments are mandatory.
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
    this.fieldOps
      .submitCustomerRequest({
        name: this.name().trim(),
        phone: this.phone().trim(),
        taxRegistrationNumber: this.taxNumber().trim(),
        paymentMode: this.paymentMode(),
        customerGroup: 'RETAIL',
        attachmentRefs: [...this.attached()].map((d) => d.toLowerCase().replace(/\s+/g, '_')),
      })
      .subscribe({
        next: (result) => {
          this.day.addCustomerRequest();
          this.isPosting.set(false);
          this.toast(`Request ${result.requestId} sent to Finance for review`, 'success');
          this.router.navigate(['/inventory/van-sales']);
        },
        error: () => {
          this.isPosting.set(false);
          this.toast("Couldn't submit the request. Try again.", 'danger');
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

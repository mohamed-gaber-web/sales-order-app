import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { DeviceLocationService } from '../../../../core/services/device-location.service';
import { GeoPoint } from '../../../../models/van-journey.model';
import { NetworkStatusService, VanTransactionsService } from '../../../../core/van-sales';

type PaymentMode = 'COD' | 'Credit';

/** The three documents a new account needs before Finance can approve it. */
const REQUIRED_DOCS = ['Commercial registration', 'Tax card', 'National address'] as const;
type RequiredDoc = (typeof REQUIRED_DOCS)[number];

/**
 * Submit a request to onboard a new customer (API #35).
 *
 * Goes through the van-sales outbox, so a request raised with no signal is
 * kept on the device and sent when the van is back online. The request id is
 * minted on the device and shown to the rep, so they can quote it to Finance
 * before D365 has even seen it.
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
  private tx = inject(VanTransactionsService);
  private network = inject(NetworkStatusService);
  private location = inject(DeviceLocationService);

  readonly docs = REQUIRED_DOCS;

  readonly name = signal('');
  readonly phone = signal('');
  readonly taxNumber = signal('');
  readonly address = signal('');
  readonly position = signal<GeoPoint | null>(null);
  readonly locating = signal(false);
  readonly gpsCaptured = computed(() => this.position() !== null);
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
    if (this.locating()) return;
    this.locating.set(true);
    this.location.getCurrent().subscribe((fix) => {
      this.locating.set(false);
      if (fix) this.position.set(fix);
      else this.toast("Couldn't get a GPS fix. You can still submit.", 'danger');
    });
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
    const pos = this.position();
    const requestId = this.tx.submitCustomerRequest({
      Name: this.name().trim(),
      Phone: this.phone().trim(),
      TaxNumber: this.taxNumber().trim(),
      Address: this.address().trim(),
      PaymentTerms: this.paymentMode() === 'Credit' ? 'CREDIT' : 'CASH',
      Documents: [...this.attached()],
      Lat: pos?.lat ?? null,
      Lon: pos?.lng ?? null,
    });
    this.isPosting.set(false);

    this.toast(
      this.network.online()
        ? `Request ${requestId} sent for review`
        : `Request ${requestId} queued — sends when online`,
      'success'
    );
    this.router.navigate(['/inventory/van-sales']);
  }

  private async toast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({
      message,
      duration: color === 'success' ? 2600 : 3000,
      position: 'top',
      color,
    });
    await toast.present();
  }
}

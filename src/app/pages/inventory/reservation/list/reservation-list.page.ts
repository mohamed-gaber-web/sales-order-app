import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';

@Component({
  selector: 'app-reservation-list',
  templateUrl: './reservation-list.page.html',
  styleUrls: ['./reservation-list.page.scss'],
  standalone: false,
})
export class ReservationListPage {
  segment: 'reserve' | 'release' = 'reserve';

  reserveForm: FormGroup;
  releaseForm: FormGroup;

  orderTypes = [
    { label: 'Sales Order', value: 'SalesOrder' },
    { label: 'Transfer Order', value: 'TransferOrder' },
    { label: 'Production Order', value: 'ProductionOrder' },
  ];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
  ) {
    this.reserveForm = this.fb.group({
      orderType:   ['', Validators.required],
      orderNumber: ['', Validators.required],
      itemNumber:  ['', Validators.required],
      quantity:    [null, [Validators.required, Validators.min(0.001)]],
    });

    this.releaseForm = this.fb.group({
      orderType:   ['', Validators.required],
      orderNumber: ['', Validators.required],
      itemNumber:  ['', Validators.required],
      quantity:    [null, [Validators.required, Validators.min(0.001)]],
    });
  }

  goBack(): void {
    this.router.navigate(['/inventory']);
  }

  segmentChanged(event: CustomEvent): void {
    this.segment = event.detail.value;
  }

  async submitReserve(): Promise<void> {
    if (this.reserveForm.invalid) {
      this.reserveForm.markAllAsTouched();
      return;
    }
    const loading = await this.loadingCtrl.create({ message: 'Creating reservation...', duration: 1000 });
    await loading.present();
    await loading.onDidDismiss();
    const toast = await this.toastCtrl.create({
      message: 'Reservation created (stub)',
      duration: 2500,
      color: 'success',
      position: 'bottom',
      icon: 'checkmark-circle-outline',
    });
    await toast.present();
    this.reserveForm.reset();
  }

  async submitRelease(): Promise<void> {
    if (this.releaseForm.invalid) {
      this.releaseForm.markAllAsTouched();
      return;
    }
    const loading = await this.loadingCtrl.create({ message: 'Releasing reservation...', duration: 1000 });
    await loading.present();
    await loading.onDidDismiss();
    const toast = await this.toastCtrl.create({
      message: 'Reservation released (stub)',
      duration: 2500,
      color: 'warning',
      position: 'bottom',
      icon: 'refresh-circle-outline',
    });
    await toast.present();
    this.releaseForm.reset();
  }

  hasError(form: FormGroup, field: string): boolean {
    const ctrl = form.get(field);
    return !!(ctrl && ctrl.invalid && ctrl.touched);
  }
}

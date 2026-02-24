import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { forkJoin } from 'rxjs';
import { LookupService } from '../../../core/services/lookup.service';
import { SalesOrderService } from '../../../core/services/sales-order.service';

@Component({
  selector: 'app-sales-order-form',
  templateUrl: './sales-order-form.page.html',
  styleUrls: ['./sales-order-form.page.scss'],
  standalone: false
})
export class SalesOrderFormPage implements OnInit {
  orderForm: FormGroup;
  isLoading = false;
  isSubmitting = false;

  // Lookup signals exposed from the service
  readonly companies = this.lookupService.companies;
  readonly currencies = this.lookupService.currencies;
  readonly customers = this.lookupService.customers;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private lookupService: LookupService,
    private salesOrderService: SalesOrderService
  ) {
    this.orderForm = this.fb.group({
      SalesOrderNumber: ['', Validators.required],
      dataAreaId: ['', Validators.required],
      CurrencyCode: ['', Validators.required],
      OrderingCustomerAccountNumber: ['', Validators.required]
    });
  }

  ngOnInit() {
    this.loadLookups();
  }

  private loadLookups() {
    this.isLoading = true;
    forkJoin([
      this.lookupService.loadCompanies(),
      this.lookupService.loadCurrencies(),
      this.lookupService.loadCustomers()
    ]).subscribe({
      next: () => { this.isLoading = false; },
      error: async () => {
        this.isLoading = false;
        const toast = await this.toastCtrl.create({
          message: 'Failed to load data. Please try again.',
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  async onSubmit() {
    if (this.orderForm.invalid) {
      this.orderForm.markAllAsTouched();
      const toast = await this.toastCtrl.create({
        message: 'Please fill in all required fields',
        duration: 2000,
        color: 'danger',
        position: 'bottom'
      });
      await toast.present();
      return;
    }

    this.isSubmitting = true;
    const loading = await this.loadingCtrl.create({
      message: 'Creating sales order...',
      spinner: 'crescent'
    });
    await loading.present();

    const payload = {
      ...this.orderForm.value,
      dataAreaId: (this.orderForm.value.dataAreaId as string).toLowerCase()
    };

    this.salesOrderService.createOrderHeader(payload).subscribe({
      next: async () => {
        this.isSubmitting = false;
        await loading.dismiss();
        const toast = await this.toastCtrl.create({
          message: 'Sales order created successfully',
          duration: 2000,
          color: 'success',
          position: 'bottom'
        });
        await toast.present();
        this.router.navigate(['/sales-order/list']);
      },
      error: async () => {
        this.isSubmitting = false;
        await loading.dismiss();
        const toast = await this.toastCtrl.create({
          message: 'Failed to create sales order. Please try again.',
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  goBack() {
    this.router.navigate(['/sales-order/list']);
  }
}

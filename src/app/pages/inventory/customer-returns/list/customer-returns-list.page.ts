import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';

export interface ReturnOrderItem {
  returnNumber: string;
  customerAccount: string;
  customerName?: string;
  status: string;
  originalSalesOrder?: string;
  totalLines?: number;
}

@Component({
  selector: 'app-customer-returns-list',
  templateUrl: './customer-returns-list.page.html',
  styleUrls: ['./customer-returns-list.page.scss'],
  standalone: false,
})
export class CustomerReturnsListPage {
  returnNumber = '';
  isLoading = false;
  errorMessage = '';

  constructor(
    private router: Router,
    private toastCtrl: ToastController,
  ) {}

  ionViewWillEnter() {
    this.returnNumber = '';
    this.errorMessage = '';
  }

  async lookupReturn() {
    const num = this.returnNumber.trim();
    if (!num) {
      const t = await this.toastCtrl.create({ message: 'Enter a return order number.', duration: 2000, color: 'warning', position: 'bottom' });
      await t.present();
      return;
    }
    this.router.navigate(['/inventory/customer-returns/receive', num]);
  }

  goBack() { this.router.navigate(['/inventory']); }
}

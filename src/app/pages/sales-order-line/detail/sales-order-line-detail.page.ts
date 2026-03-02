import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import {
  SalesOrderLineService,
  SalesOrderLineResponse,
} from '../../../core/services/sales-order-line.service';

@Component({
  selector: 'app-sales-order-line-detail',
  templateUrl: './sales-order-line-detail.page.html',
  styleUrls: ['./sales-order-line-detail.page.scss'],
  standalone: false,
})
export class SalesOrderLineDetailPage implements OnInit {
  salesOrderNumber = '';
  lines: SalesOrderLineResponse[] = [];
  isLoading = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private toastCtrl: ToastController,
    private orderLineService: SalesOrderLineService
  ) {}

  ngOnInit() {
    this.salesOrderNumber =
      this.route.snapshot.paramMap.get('salesOrderNumber') ?? '';
  }

  ionViewWillEnter() {
    this.loadLines();
  }

  loadLines() {
    if (!this.salesOrderNumber) return;
    this.isLoading = true;
    this.orderLineService.getOrderLines(this.salesOrderNumber).subscribe({
      next: (res) => {
        this.lines = res.value;
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        const toast = await this.toastCtrl.create({
          message: 'Failed to load order lines.',
          duration: 3000,
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  addLine() {
    this.router.navigate([
      '/sales-order-line/create',
      this.salesOrderNumber,
    ]);
  }

  goBack() {
    this.router.navigate(['/sales-order/list']);
  }

  formatCurrency(value?: number): string {
    if (value == null) return '—';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}

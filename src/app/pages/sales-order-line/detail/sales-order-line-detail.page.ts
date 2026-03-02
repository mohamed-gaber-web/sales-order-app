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
  allLines: SalesOrderLineResponse[] = [];
  lines: SalesOrderLineResponse[] = [];
  searchTerm = '';
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
        this.allLines = res.value;
        this.filterLines();
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

  onSearchChange() {
    this.filterLines();
  }

  private filterLines() {
    if (!this.searchTerm.trim()) {
      this.lines = [...this.allLines];
      return;
    }
    const term = this.searchTerm.toLowerCase();
    this.lines = this.allLines.filter((line) =>
      (line.ItemNumber ?? '').toLowerCase().includes(term) ||
      (line.ProductName ?? '').toLowerCase().includes(term) ||
      (line.ShippingSiteId ?? '').toLowerCase().includes(term) ||
      (line.ShippingWarehouseId ?? '').toLowerCase().includes(term) ||
      (line.ProductConfigurationId ?? '').toLowerCase().includes(term) ||
      (line.ProductSizeId ?? '').toLowerCase().includes(term) ||
      (line.ProductColorId ?? '').toLowerCase().includes(term) ||
      (line.ProductStyleId ?? '').toLowerCase().includes(term)
    );
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

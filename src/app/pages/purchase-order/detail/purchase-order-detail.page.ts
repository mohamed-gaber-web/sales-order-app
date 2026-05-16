import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { PurchaseOrderHeader, PurchaseOrderLine } from '../../../models/purchase-order.model';

@Component({
  selector: 'app-purchase-order-detail',
  templateUrl: './purchase-order-detail.page.html',
  styleUrls: ['./purchase-order-detail.page.scss'],
  standalone: false
})
export class PurchaseOrderDetailPage implements OnInit {
  poNumber = '';
  po: PurchaseOrderHeader | null = null;
  isLoading = false;
  searchTerm = '';

  get filteredLines(): PurchaseOrderLine[] {
    const lines = this.po?.PurchaseOrderLinesV2 ?? [];
    if (!this.searchTerm.trim()) return lines;
    const t = this.searchTerm.toLowerCase();
    return lines.filter(l =>
      l.ItemNumber.toLowerCase().includes(t) ||
      (l.ProductName ?? '').toLowerCase().includes(t) ||
      (l.ReceivingWarehouseId ?? '').toLowerCase().includes(t)
    );
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private toastCtrl: ToastController,
    private poService: PurchaseOrderService
  ) {}

  ngOnInit() {
    this.poNumber = this.route.snapshot.paramMap.get('poNumber') ?? '';
    if (this.poNumber) {
      this.loadDetail();
    }
  }

  loadDetail() {
    this.isLoading = true;
    this.po = null;
    this.poService.getOrderWithLines(this.poNumber).subscribe({
      next: (res) => {
        this.po = res;
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        const toast = await this.toastCtrl.create({
          message: 'Failed to load purchase order details.',
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  receiveLine(line: PurchaseOrderLine) {
    this.router.navigate(
      ['/purchase-order/receive', this.poNumber, line.LineNumber],
      { state: { line, po: this.po } }
    );
  }

  goBack() {
    this.router.navigate(['/purchase-order/list']);
  }

  getRemainingQty(line: PurchaseOrderLine): number {
    return line.RemainingPurchaseQuantity ?? line.PurchaseQuantity;
  }

  isFullyReceived(line: PurchaseOrderLine): boolean {
    return this.getRemainingQty(line) <= 0;
  }

  getLineStatusColor(line: PurchaseOrderLine): string {
    const remaining = this.getRemainingQty(line);
    if (remaining <= 0) return 'success';
    if (remaining < line.PurchaseQuantity) return 'warning';
    return 'primary';
  }

  getLineStatusLabel(line: PurchaseOrderLine): string {
    const remaining = this.getRemainingQty(line);
    if (remaining <= 0) return 'Received';
    if (remaining < line.PurchaseQuantity) return 'Partial';
    return 'Open';
  }
}

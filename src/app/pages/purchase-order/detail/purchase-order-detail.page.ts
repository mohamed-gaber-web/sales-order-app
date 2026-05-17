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
          message: 'Couldn\'t load this order. Tap retry.',
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

  private safeNum(val: unknown, fallback = 0): number {
    const n = Number(val);
    return isNaN(n) || n < 0 ? fallback : n;
  }

  getTotalQty(line: PurchaseOrderLine): number {
    return this.safeNum(line.OrderedPurchaseQuantity ?? line.PurchaseQuantity);
  }

  getRemainingQty(line: PurchaseOrderLine): number {
    const rem = Number(line.RemainingPurchaseQuantity);
    return isNaN(rem) || rem < 0 ? this.getTotalQty(line) : rem;
  }

  isFullyReceived(line: PurchaseOrderLine): boolean {
    return this.getTotalQty(line) > 0 && this.getRemainingQty(line) <= 0;
  }

  getLineStatusColor(line: PurchaseOrderLine): string {
    const total = this.getTotalQty(line);
    const remaining = this.getRemainingQty(line);
    if (total > 0 && remaining <= 0) return 'success';
    if (remaining < total) return 'warning';
    return 'primary';
  }

  getLineStatusLabel(line: PurchaseOrderLine): string {
    const total = this.getTotalQty(line);
    const remaining = this.getRemainingQty(line);
    if (total > 0 && remaining <= 0) return 'Received';
    if (remaining < total) return 'Partial';
    return 'Open';
  }

  getReceivedQty(line: PurchaseOrderLine): number {
    return Math.max(0, this.getTotalQty(line) - this.getRemainingQty(line));
  }

  getReceivedPct(line: PurchaseOrderLine): number {
    const total = this.getTotalQty(line);
    if (total <= 0) return 0;
    return Math.min(100, Math.round((this.getReceivedQty(line) / total) * 100));
  }
}

import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { TransferOrderService } from '../../../core/services/transfer-order.service';
import { TransferOrderHeader, TransferOrderLine } from '../../../models/transfer-order.model';

@Component({
  selector: 'app-transfer-order-detail',
  templateUrl: './transfer-order-detail.page.html',
  styleUrls: ['./transfer-order-detail.page.scss'],
  standalone: false
})
export class TransferOrderDetailPage implements OnInit {
  transferOrderNumber = '';
  order: TransferOrderHeader | null = null;
  lines: TransferOrderLine[] = [];
  isLoading = false;
  searchTerm = '';

  get filteredLines(): TransferOrderLine[] {
    if (!this.searchTerm.trim()) return this.lines;
    const t = this.searchTerm.toLowerCase();
    return this.lines.filter(l =>
      l.ItemNumber.toLowerCase().includes(t)
    );
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private toastCtrl: ToastController,
    private toService: TransferOrderService
  ) {}

  ngOnInit() {
    this.transferOrderNumber = this.route.snapshot.paramMap.get('transferId') ?? '';
    if (this.transferOrderNumber) {
      this.loadDetail();
    }
  }

  loadDetail() {
    this.isLoading = true;
    this.order = null;
    this.lines = [];
    this.toService.getOrderWithLines(this.transferOrderNumber).subscribe({
      next: ({ header, lines }) => {
        this.order = header;
        this.lines = lines;
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        const toast = await this.toastCtrl.create({
          message: 'Couldn\'t load this transfer. Tap retry.',
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  goBack() {
    this.router.navigate(['/transfer-order/list']);
  }

  getStatusColor(status?: string): string {
    switch (status) {
      case 'Created':  return 'primary';
      case 'Shipped':  return 'warning';
      case 'Received': return 'success';
      default:         return 'medium';
    }
  }

  getRemainingQty(line: TransferOrderLine): number {
    return line.RemainingShippedQuantity ?? line.TransferQuantity;
  }

  getShippedQty(line: TransferOrderLine): number {
    return line.ShippedQuantity ?? Math.max(0, line.TransferQuantity - this.getRemainingQty(line));
  }

  getShippedPct(line: TransferOrderLine): number {
    if (line.TransferQuantity <= 0) return 0;
    return Math.min(100, Math.round((this.getShippedQty(line) / line.TransferQuantity) * 100));
  }

  isFullyShipped(line: TransferOrderLine): boolean {
    return this.getRemainingQty(line) <= 0;
  }

  getLineStatusLabel(line: TransferOrderLine): string {
    const remaining = this.getRemainingQty(line);
    if (remaining <= 0) return 'Shipped';
    if (remaining < line.TransferQuantity) return 'Partial';
    return 'Open';
  }

  getLineStatusColor(line: TransferOrderLine): string {
    const remaining = this.getRemainingQty(line);
    if (remaining <= 0) return 'success';
    if (remaining < line.TransferQuantity) return 'warning';
    return 'primary';
  }
}

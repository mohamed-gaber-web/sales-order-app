import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
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
    return this.lines.filter(l => l.ItemNumber.toLowerCase().includes(t));
  }

  get canShip(): boolean {
    return this.order?.TransferOrderStatus === 'Created' || this.order?.TransferOrderStatus === 'Open';
  }

  get canReceive(): boolean {
    return this.order?.TransferOrderStatus === 'Shipped';
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private toService: TransferOrderService
  ) {}

  ngOnInit() {
    this.transferOrderNumber = this.route.snapshot.paramMap.get('transferId') ?? '';
    if (this.transferOrderNumber) this.loadDetail();
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
          duration: 3000, color: 'danger', position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  async shipLine(line: TransferOrderLine) {
    const remaining = this.getRemainingShip(line);
    const alert = await this.alertCtrl.create({
      header: 'Ship Line',
      subHeader: `${line.ItemNumber} — Line ${line.LineNumber}`,
      inputs: [
        {
          name: 'qty',
          type: 'number',
          placeholder: 'Quantity',
          value: remaining,
          min: 0.001,
          max: remaining,
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Ship',
          handler: (data) => {
            const qty = Number(data.qty);
            if (!qty || qty <= 0) return false;
            this.executeShip(line, qty);
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  async receiveLine(line: TransferOrderLine) {
    const remaining = this.getRemainingReceive(line);
    const alert = await this.alertCtrl.create({
      header: 'Receive Line',
      subHeader: `${line.ItemNumber} — Line ${line.LineNumber}`,
      inputs: [
        {
          name: 'qty',
          type: 'number',
          placeholder: 'Quantity',
          value: remaining,
          min: 0.001,
          max: remaining,
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Receive',
          handler: (data) => {
            const qty = Number(data.qty);
            if (!qty || qty <= 0) return false;
            this.executeReceive(line, qty);
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  private async executeShip(line: TransferOrderLine, qty: number) {
    const loading = await this.loadingCtrl.create({ message: 'Shipping...', spinner: 'crescent' });
    await loading.present();

    this.toService.shipTransferOrder({
      _request: {
        DataAreaId: (this.order?.dataAreaId as string ?? 'usmf').toUpperCase(),
        transferOrderID: this.transferOrderNumber,
        transferLineNum: [line.LineNumber],
        transferQTY: [qty],
      }
    }).subscribe({
      next: async (res) => {
        await loading.dismiss();
        if (res.Success) {
          const toast = await this.toastCtrl.create({
            message: `Line ${line.LineNumber} shipped successfully.`,
            duration: 3000, color: 'success', position: 'bottom'
          });
          await toast.present();
          this.loadDetail();
        } else {
          const toast = await this.toastCtrl.create({
            message: res.ErrorMessage || res.DebugMessage || 'Ship failed. Try again.',
            duration: 5000, color: 'danger', position: 'bottom'
          });
          await toast.present();
        }
      },
      error: async (err) => {
        await loading.dismiss();
        const msg = err?.error?.Message ?? err?.error?.message ?? err?.message;
        const toast = await this.toastCtrl.create({
          message: msg ? `Ship failed: ${msg}` : 'Ship failed. Try again.',
          duration: 5000, color: 'danger', position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  private async executeReceive(line: TransferOrderLine, qty: number) {
    const loading = await this.loadingCtrl.create({ message: 'Receiving...', spinner: 'crescent' });
    await loading.present();

    this.toService.receiveTransferOrder({
      _request: {
        DataAreaId: (this.order?.dataAreaId as string ?? 'usmf').toUpperCase(),
        transferOrderID: this.transferOrderNumber,
        transferLineNum: [line.LineNumber],
        transferQTY: [qty],
      }
    }).subscribe({
      next: async (res) => {
        await loading.dismiss();
        if (res.Success) {
          const toast = await this.toastCtrl.create({
            message: `Line ${line.LineNumber} received successfully.`,
            duration: 3000, color: 'success', position: 'bottom'
          });
          await toast.present();
          this.loadDetail();
        } else {
          const toast = await this.toastCtrl.create({
            message: res.ErrorMessage || res.DebugMessage || 'Receive failed. Try again.',
            duration: 5000, color: 'danger', position: 'bottom'
          });
          await toast.present();
        }
      },
      error: async (err) => {
        await loading.dismiss();
        const msg = err?.error?.Message ?? err?.error?.message ?? err?.message;
        const toast = await this.toastCtrl.create({
          message: msg ? `Receive failed: ${msg}` : 'Receive failed. Try again.',
          duration: 5000, color: 'danger', position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  goBack() { this.router.navigate(['/transfer-order/list']); }

  private safeNum(val: unknown): number {
    const n = Number(val);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  getStatusColor(status?: string): string {
    switch (status) {
      case 'Created':  return 'primary';
      case 'Open':     return 'primary';
      case 'Shipped':  return 'warning';
      case 'Received': return 'success';
      default:         return 'medium';
    }
  }

  getRemainingShip(line: TransferOrderLine): number {
    return this.safeNum(line.RemainingShippedQuantity ?? line.TransferQuantity);
  }

  getRemainingReceive(line: TransferOrderLine): number {
    return this.safeNum(line.RemainingReceivedQuantity);
  }

  getShippedQty(line: TransferOrderLine): number {
    return this.safeNum(line.ShippedQuantity);
  }

  getReceivedQty(line: TransferOrderLine): number {
    return this.safeNum(line.ReceivedQuantity);
  }

  getShippedPct(line: TransferOrderLine): number {
    const total = this.safeNum(line.TransferQuantity);
    if (total <= 0) return 0;
    return Math.min(100, Math.round((this.getShippedQty(line) / total) * 100));
  }

  getReceivedPct(line: TransferOrderLine): number {
    const shipped = this.getShippedQty(line);
    if (shipped <= 0) return 0;
    return Math.min(100, Math.round((this.getReceivedQty(line) / shipped) * 100));
  }

  isLineComplete(line: TransferOrderLine): boolean {
    return line.LineStatus === 'Received';
  }

  canShipLine(line: TransferOrderLine): boolean {
    return this.canShip && this.getRemainingShip(line) > 0;
  }

  canReceiveLine(line: TransferOrderLine): boolean {
    return this.canReceive && this.getRemainingReceive(line) > 0;
  }

  getLineStatusLabel(line: TransferOrderLine): string {
    return line.LineStatus || 'Open';
  }

  getLineStatusColor(line: TransferOrderLine): string {
    switch (line.LineStatus) {
      case 'Received': return 'success';
      case 'Shipping': return 'warning';
      default:         return 'primary';
    }
  }
}

import { Component, OnInit, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { QualityService } from '../../../../core/services/quality.service';
import { QualityOrder } from '../../../../models/quality.model';

@Component({
  selector: 'app-quality-quarantine',
  templateUrl: './quality-quarantine.page.html',
  styleUrls: ['./quality-quarantine.page.scss'],
  standalone: false,
})
export class QualityQuarantinePage implements OnInit {
  orders: QualityOrder[] = [];
  isLoading = false;
  releasingId: string | null = null;

  private toastCtrl = inject(ToastController);
  private qualityService = inject(QualityService);

  ngOnInit() {
    this.load();
  }

  load() {
    this.isLoading = true;
    this.qualityService.getQuarantined().subscribe({
      next: (res) => {
        this.orders = res;
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        const toast = await this.toastCtrl.create({
          message: 'Could not load held stock.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  get totalValue(): number {
    return this.orders.reduce((sum, o) => sum + (o.valuePerUnit ?? 0) * o.quantity, 0);
  }

  statusLabel(order: QualityOrder): string {
    if (!order.decision) return 'Under Inspection';
    if (order.decision === 'Reject') return 'Rejected — For Return';
    return 'Approved for Release';
  }

  statusColor(order: QualityOrder): string {
    if (!order.decision) return 'warning';
    if (order.decision === 'Reject') return 'danger';
    return 'success';
  }

  canRelease(order: QualityOrder): boolean {
    return !!order.decision && order.decision !== 'Reject';
  }

  release(order: QualityOrder) {
    if (!this.canRelease(order) || this.releasingId) return;
    this.releasingId = order.qualityOrderId;
    this.qualityService.releaseFromQuarantine(order.qualityOrderId).subscribe({
      next: async () => {
        this.releasingId = null;
        this.orders = this.orders.filter(o => o.qualityOrderId !== order.qualityOrderId);
        const toast = await this.toastCtrl.create({
          message: `${order.licensePlateId ?? order.qualityOrderId} released to available stock.`,
          duration: 2500, color: 'success', position: 'bottom',
        });
        await toast.present();
      },
      error: async () => {
        this.releasingId = null;
        const toast = await this.toastCtrl.create({
          message: 'Could not release. Try again.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
        });
        await toast.present();
      },
    });
  }
}

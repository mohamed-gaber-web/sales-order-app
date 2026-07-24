import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { QualityService } from '../../../../core/services/quality.service';
import { QualityOrder, QualitySource } from '../../../../models/quality.model';

type SourceFilter = 'All' | QualitySource;

@Component({
  selector: 'app-quality-list',
  templateUrl: './quality-list.page.html',
  styleUrls: ['./quality-list.page.scss'],
  standalone: false,
})
export class QualityListPage implements OnInit {
  orders: QualityOrder[] = [];
  isLoading = false;
  activeFilter: SourceFilter = 'All';

  readonly filters: SourceFilter[] = ['All', 'Purchase', 'Production', 'Return'];

  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private qualityService = inject(QualityService);

  ngOnInit() {
    this.loadQueue();
  }

  loadQueue() {
    this.isLoading = true;
    this.qualityService.getQueue().subscribe({
      next: (res) => {
        this.orders = res;
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        const toast = await this.toastCtrl.create({
          message: 'Could not load the quality queue.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  get filteredOrders(): QualityOrder[] {
    if (this.activeFilter === 'All') return this.orders;
    return this.orders.filter(o => o.source === this.activeFilter);
  }

  countFor(filter: SourceFilter): number {
    if (filter === 'All') return this.orders.length;
    return this.orders.filter(o => o.source === filter).length;
  }

  get overdueCount(): number {
    return this.orders.filter(o => this.isOverdue(o)).length;
  }

  ageHours(order: QualityOrder): number {
    return Math.max(0, Math.round((Date.now() - Date.parse(order.createdAt)) / 3_600_000));
  }

  isOverdue(order: QualityOrder): boolean {
    return this.ageHours(order) > 24;
  }

  sourceIcon(source: QualitySource): string {
    switch (source) {
      case 'Purchase': return 'download-outline';
      case 'Production': return 'construct-outline';
      case 'Return': return 'return-down-back-outline';
    }
  }

  open(order: QualityOrder) {
    this.router.navigate(['/inventory/quality/tests', order.qualityOrderId]);
  }
}

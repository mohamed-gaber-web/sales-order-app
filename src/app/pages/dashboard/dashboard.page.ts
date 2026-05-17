import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ModalController, ToastController } from '@ionic/angular';
import { PurchaseOrderService } from '../../core/services/purchase-order.service';
import { SalesOrderService } from '../../core/services/sales-order.service';
import { TransferOrderService } from '../../core/services/transfer-order.service';
import { BarcodeScannerService } from '../../core/services/barcode-scanner.service';
import { ScannerModalComponent } from '../inventory/scanner/scanner-modal.component';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false
})
export class DashboardPage implements OnInit {
  poCount: number | null = null;
  soCount: number | null = null;
  toCount: number | null = null;
  isLoadingStats = true;
  private pendingStats = 3;

  get greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  get currentDate(): string {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    });
  }

  readonly modules = [
    {
      title: 'Purchase Orders',
      subtitle: 'Receive incoming goods',
      icon: 'cube-outline',
      route: '/purchase-order/list',
      color: 'var(--gp-accent)',
      colorEnd: 'var(--gp-accent-end)',
    },
    {
      title: 'Sales Orders',
      subtitle: 'Process customer orders',
      icon: 'cart-outline',
      route: '/sales-order/list',
      color: 'var(--gp-navy)',
      colorEnd: '#1a3b6a',
    },
    {
      title: 'Transfer Orders',
      subtitle: 'Move stock between sites',
      icon: 'swap-horizontal-outline',
      route: '/transfer-order/list',
      color: '#0f766e',
      colorEnd: '#0d9488',
    },
    {
      title: 'Cycle Count',
      subtitle: 'Count & adjust inventory',
      icon: 'clipboard-outline',
      route: '/inventory/cycle-count',
      color: '#7c3aed',
      colorEnd: '#6d28d9',
    },
  ];

  readonly aiFeatures = [
    {
      module: 'Sales Orders',
      moduleIcon: 'cart-outline',
      title: 'Inventory Availability Check',
      desc: 'Before confirming a sales order line, AI verifies live stock and warns if inventory may fall short.',
      icon: 'checkmark-circle-outline',
      gradient: 'linear-gradient(135deg, var(--gp-navy) 0%, #1a3b6a 100%)',
    },
    {
      module: 'Purchase Orders',
      moduleIcon: 'cube-outline',
      title: 'Smart Reorder Suggestions',
      desc: 'AI analyses sales velocity and lead times to recommend exactly what to buy and when.',
      icon: 'bulb-outline',
      gradient: 'linear-gradient(135deg, var(--gp-accent) 0%, var(--gp-accent-end) 100%)',
    },
    {
      module: 'Transfer Orders',
      moduleIcon: 'swap-horizontal-outline',
      title: 'Optimal Transfer Routing',
      desc: 'AI picks the best source warehouse for each transfer based on current stock and distance.',
      icon: 'navigate-outline',
      gradient: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
    },
    {
      module: 'Cycle Count',
      moduleIcon: 'clipboard-outline',
      title: 'Smart Count Prioritisation',
      desc: 'AI ranks which items to count first by flagging high-risk discrepancies before they become losses.',
      icon: 'stats-chart-outline',
      gradient: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
    },
  ];

  constructor(
    private router: Router,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private poService: PurchaseOrderService,
    private soService: SalesOrderService,
    private toService: TransferOrderService,
    private scannerService: BarcodeScannerService,
  ) {}

  ngOnInit() {
    this.loadStats();
  }

  private loadStats() {
    this.isLoadingStats = true;
    this.pendingStats = 3;

    this.poService.getOrderHeaders(0).subscribe({
      next: (res) => { this.poCount = res['@odata.count'] ?? res.value.length; this.checkDone(); },
      error: () => { this.poCount = null; this.checkDone(); }
    });

    this.soService.getOrderHeaders(0).subscribe({
      next: (res) => { this.soCount = res['@odata.count'] ?? res.value.length; this.checkDone(); },
      error: () => { this.soCount = null; this.checkDone(); }
    });

    this.toService.getOrderHeaders(0).subscribe({
      next: (res) => { this.toCount = res['@odata.count'] ?? res.value.length; this.checkDone(); },
      error: () => { this.toCount = null; this.checkDone(); }
    });
  }

  private checkDone() {
    this.pendingStats--;
    if (this.pendingStats <= 0) this.isLoadingStats = false;
  }

  navigate(route: string) {
    this.router.navigateByUrl(route);
  }

  async openScanner() {
    const modal = await this.modalCtrl.create({
      component: ScannerModalComponent,
      cssClass: 'scanner-modal',
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await modal.present();

    const { data } = await modal.onWillDismiss<string>();
    if (data) {
      const route = this.scannerService.resolveRoute(data);
      // Pass scanned value as state for the target page to pick up
      this.router.navigateByUrl(route, { state: { scannedValue: data } });
    }
  }
}

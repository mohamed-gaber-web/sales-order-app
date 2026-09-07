import { Component, NgZone, OnInit, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ModalController, ToastController } from '@ionic/angular';
import { FormatService, PortalSessionStore, TenantConfigStore } from '../../core';
import { PurchaseOrderService } from '../../core/services/purchase-order.service';
import { SalesOrderService } from '../../core/services/sales-order.service';
import { TransferOrderService } from '../../core/services/transfer-order.service';
import { BarcodeScannerService } from '../../core/services/barcode-scanner.service';
import { ScannerModalComponent } from '../inventory/scanner/scanner-modal.component';

/**
 * A line in the "Needs attention" list.
 *
 * `labelKey` plus `count` rather than a finished sentence: Arabic puts the
 * number and the noun in a different order from English, so only a
 * parameterised string can read correctly in both.
 */
interface AlertItem {
  labelKey: string;
  count: number;
  icon: string;
  color: string;
  bg: string;
  route: string;
}

interface Module {
  titleKey: string;
  subtitleKey: string;
  icon: string;
  route: string;
  color: string;
  colorEnd: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false
})
export class DashboardPage implements OnInit {
  private readonly format = inject(FormatService);
  private readonly session = inject(PortalSessionStore);
  private readonly tenantConfig = inject(TenantConfigStore);

  poCount: number | null = null;
  soCount: number | null = null;
  toCount: number | null = null;
  animatedPoCount: number | null = null;
  animatedSoCount: number | null = null;
  animatedToCount: number | null = null;
  isLoadingStats = true;
  private pendingStats = 3;

  get greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  get currentDate(): string {
    return this.format.dateLong(new Date());
  }

  /**
   * The organisation, as the sign-in response named it.
   *
   * Shown where the product name used to be. "Grow Path" told a rep nothing they
   * did not already know; their own company name tells them which workspace
   * these figures belong to — which matters once one person can hold accounts in
   * more than one. Falls back to the product name only before a session exists.
   */
  readonly companyName = computed(() => this.session.workspaceName() || 'Grow Path');

  /**
   * The D365 legal entity these figures are scoped to.
   *
   * Read from the tenant's own configuration rather than the hard-coded 'USMF'
   * this used to be. Empty until the configuration loads, and the template hides
   * the badges rather than showing an empty pill.
   */
  readonly workspace = computed(() => (this.tenantConfig.dataAreaId() ?? '').toUpperCase());

  readonly alerts: AlertItem[] = [
    {
      labelKey: 'dashboard.alerts.poAwaitingReceipt',
      count: 3,
      icon: 'download-outline',
      color: '#d97706',
      bg: 'rgba(217,119,6,.09)',
      route: '/purchase-order/list',
    },
    {
      labelKey: 'dashboard.alerts.soReadyToShip',
      count: 2,
      icon: 'cube-outline',
      color: '#002559',
      bg: 'rgba(0,37,89,.07)',
      route: '/sales-order/list',
    },
    {
      labelKey: 'dashboard.alerts.toPastDue',
      count: 1,
      icon: 'alert-circle-outline',
      color: '#dc2626',
      bg: 'rgba(220,38,38,.07)',
      route: '/transfer-order/list',
    },
  ];

  readonly modules: Module[] = [
    {
      titleKey: 'doc.purchaseOrders',
      subtitleKey: 'dashboard.modules.purchaseOrdersSub',
      icon: 'cube-outline',
      route: '/purchase-order/list',
      color: '#F24C1A',
      colorEnd: '#F28E26',
    },
    {
      titleKey: 'doc.salesOrders',
      subtitleKey: 'dashboard.modules.salesOrdersSub',
      icon: 'cart-outline',
      route: '/sales-order/list',
      color: '#002559',
      colorEnd: '#003a7d',
    },
    {
      titleKey: 'doc.transferOrders',
      subtitleKey: 'dashboard.modules.transferOrdersSub',
      icon: 'swap-horizontal-outline',
      route: '/transfer-order/list',
      color: '#0f766e',
      colorEnd: '#0d9488',
    },
    {
      titleKey: 'doc.productionIssue',
      subtitleKey: 'dashboard.modules.productionIssueSub',
      icon: 'construct-outline',
      route: '/inventory/production-issue',
      color: '#7c3aed',
      colorEnd: '#6d28d9',
    },
    {
      titleKey: 'doc.inventory',
      subtitleKey: 'dashboard.modules.inventorySub',
      icon: 'business-outline',
      route: '/inventory',
      color: '#1d4ed8',
      colorEnd: '#1e40af',
    },
    {
      titleKey: 'doc.project',
      subtitleKey: 'dashboard.modules.projectSub',
      icon: 'folder-open-outline',
      route: '/inventory/project-issuance',
      color: '#002559',
      colorEnd: '#004aad',
    },
  ];

  readonly aiFeatures = [
    {
      moduleKey: 'doc.salesOrders',
      moduleIcon: 'cart-outline',
      titleKey: 'dashboard.ai.availabilityTitle',
      descKey: 'dashboard.ai.availabilityDesc',
      icon: 'checkmark-circle-outline',
      gradient: 'linear-gradient(135deg, #002559 0%, #1a3b6a 100%)',
    },
    {
      moduleKey: 'doc.purchaseOrders',
      moduleIcon: 'cube-outline',
      titleKey: 'dashboard.ai.reorderTitle',
      descKey: 'dashboard.ai.reorderDesc',
      icon: 'bulb-outline',
      gradient: 'linear-gradient(135deg, #F24C1A 0%, #F28E26 100%)',
    },
    {
      moduleKey: 'doc.transferOrders',
      moduleIcon: 'swap-horizontal-outline',
      titleKey: 'dashboard.ai.routingTitle',
      descKey: 'dashboard.ai.routingDesc',
      icon: 'navigate-outline',
      gradient: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
    },
    {
      moduleKey: 'dashboard.ai.cycleCount',
      moduleIcon: 'clipboard-outline',
      titleKey: 'dashboard.ai.countTitle',
      descKey: 'dashboard.ai.countDesc',
      icon: 'stats-chart-outline',
      gradient: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)',
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
    private ngZone: NgZone,
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
    if (this.pendingStats <= 0) {
      this.isLoadingStats = false;
      if (this.poCount != null) this.animateCounter(this.poCount, v => this.animatedPoCount = v);
      else this.animatedPoCount = null;
      if (this.soCount != null) this.animateCounter(this.soCount, v => this.animatedSoCount = v);
      else this.animatedSoCount = null;
      if (this.toCount != null) this.animateCounter(this.toCount, v => this.animatedToCount = v);
      else this.animatedToCount = null;
    }
  }

  private animateCounter(target: number, setter: (v: number) => void) {
    const duration = 1400;
    const startTime = performance.now();
    this.ngZone.runOutsideAngular(() => {
      const tick = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        this.ngZone.run(() => setter(Math.round(eased * target)));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
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
      this.router.navigateByUrl(route, { state: { scannedValue: data } });
    }
  }
}

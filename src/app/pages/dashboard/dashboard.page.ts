import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PurchaseOrderService } from '../../core/services/purchase-order.service';
import { SalesOrderService } from '../../core/services/sales-order.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false
})
export class DashboardPage implements OnInit {
  poCount: number | null = null;
  soCount: number | null = null;
  isLoadingStats = true;
  private pendingStats = 2;

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
      subtitle: 'Receive and manage incoming goods',
      icon: 'cube-outline',
      route: '/purchase-order/list',
      color: 'var(--gp-accent)',
      colorEnd: 'var(--gp-accent-end)',
    },
    {
      title: 'Sales Orders',
      subtitle: 'View and process customer orders',
      icon: 'cart-outline',
      route: '/sales-order/list',
      color: 'var(--gp-navy)',
      colorEnd: '#1a3b6a',
    },
  ];

  constructor(
    private router: Router,
    private poService: PurchaseOrderService,
    private soService: SalesOrderService
  ) {}

  ngOnInit() {
    this.loadStats();
  }

  private loadStats() {
    this.isLoadingStats = true;
    this.pendingStats = 2;

    this.poService.getOrderHeaders(0).subscribe({
      next: (res) => {
        this.poCount = res['@odata.count'] ?? res.value.length;
        this.checkDone();
      },
      error: () => { this.poCount = null; this.checkDone(); }
    });

    this.soService.getOrderHeaders(0).subscribe({
      next: (res) => {
        this.soCount = res['@odata.count'] ?? res.value.length;
        this.checkDone();
      },
      error: () => { this.soCount = null; this.checkDone(); }
    });
  }

  private checkDone() {
    this.pendingStats--;
    if (this.pendingStats <= 0) {
      this.isLoadingStats = false;
    }
  }

  navigate(route: string) {
    this.router.navigateByUrl(route);
  }
}

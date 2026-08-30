import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { VanDayService } from '../../../../core/services/van-day.service';
import { VanJourneyService } from '../../../../core/services/van-journey.service';
import { SalesOrderService } from '../../../../core/services/sales-order.service';
import { SalesOrderHeaderV3Response } from '../../../../models/sales-order.model';
import { VanVisit } from '../../../../models/van-journey.model';

/**
 * The driver's home for the day: the ordered route of customer stops, the day's
 * running numbers, and the way into every visit. This is the module's landing
 * page — the entry point the app menu links to.
 */
@Component({
  selector: 'app-van-journey',
  templateUrl: './van-journey.page.html',
  styleUrls: ['./van-journey.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanJourneyPage implements OnInit {
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private journey = inject(VanJourneyService);
  private salesOrders = inject(SalesOrderService);
  readonly day = inject(VanDayService);

  /** Sales orders created today, from the ERP. */
  readonly orders = signal<SalesOrderHeaderV3Response[]>([]);
  readonly ordersLoading = signal(false);

  /**
   * True when the read failed.
   *
   * Kept separate from an empty list because the two mean opposite things to a
   * driver: "no orders today" is information they can act on, and "we could not
   * ask" is not. Rendering both as an empty section would quietly tell them the
   * first when the second is true.
   */
  readonly ordersFailed = signal(false);

  ngOnInit() {
    if (!this.day.isLoaded()) this.seedDay();
    this.loadOrders();
  }

  /**
   * Today's orders.
   *
   * Deliberately not folded into the day's seed: the stops come from
   * {@link VanJourneyService}, which is still a scaffold, and this is a live
   * ERP read. Keeping them separate means a failure here leaves the route — the
   * part the driver cannot work without — on screen and usable.
   */
  private loadOrders(done?: () => void) {
    this.ordersLoading.set(true);
    this.ordersFailed.set(false);

    this.salesOrders.getOrdersForDate().subscribe({
      next: (res) => {
        this.orders.set(res?.value ?? []);
        this.ordersLoading.set(false);
        done?.();
      },
      error: () => {
        this.orders.set([]);
        this.ordersFailed.set(true);
        this.ordersLoading.set(false);
        done?.();
      },
    });
  }

  retryOrders() {
    this.loadOrders();
  }

  private seedDay() {
    this.journey.loadToday().subscribe((day) => this.day.loadIfEmpty(day));
  }

  handleRefresh(event: CustomEvent) {
    const complete = () => (event.target as HTMLIonRefresherElement).complete();
    this.journey.loadToday().subscribe({
      next: (day) => {
        this.day.reset(day);
        complete();
      },
      error: complete,
    });
    this.loadOrders();
  }

  openVisit(visit: VanVisit) {
    if (visit.status === 'done') {
      this.toast(`${visit.name} — ${visit.outcome}`);
      return;
    }
    this.day.setCurrentVisit(visit.id);
    this.router.navigate(['/inventory/van-sales/visit', visit.id]);
  }

  newCustomer() {
    this.router.navigate(['/inventory/van-sales/new-customer']);
  }

  dayClose() {
    this.router.navigate(['/inventory/van-sales/day-close']);
  }

  // ── Presentation helpers ───────────────────────────────────────────────────

  /** The customer name on an order, falling back to the account when absent. */
  orderName(order: SalesOrderHeaderV3Response): string {
    return (
      order.SalesOrderName?.trim() ||
      order.OrderingCustomerAccountNumber ||
      order.SalesOrderNumber
    );
  }

  /**
   * The time of day the order was created, e.g. `09:14`.
   *
   * The time and not the date: every order in this list was created today, so a
   * date on each card would repeat the section heading. The time is what tells
   * one apart from the next.
   */
  orderTime(order: SalesOrderHeaderV3Response): string {
    const parsed = this.parse(order.OrderCreationDateTime);
    if (!parsed) return '';
    return parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * The order's requested shipping date, short form.
   *
   * Returns '' rather than 'Invalid Date' for a missing or unparsable value —
   * a blank reads as "not set", which is true, where the browser's own string
   * for it reads as a bug.
   */
  orderDate(order: SalesOrderHeaderV3Response): string {
    const parsed = this.parse(order.RequestedShippingDate);
    if (!parsed) return '';
    return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  private parse(raw: string | undefined): Date | null {
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  /** Pin colour on the schematic map: done, current, or upcoming. */
  pinColor(visit: VanVisit): string {
    if (visit.status === 'done') return 'var(--ion-color-success, #0e9f6e)';
    if (visit.status === 'current') return 'var(--gp-navy)';
    return '#94a6c8';
  }

  statusPill(visit: VanVisit): { label: string; color: string; bg: string } | null {
    if (visit.status === 'done') {
      return { label: visit.outcome ?? 'Done', color: '#0e6f4e', bg: '#e3f5ec' };
    }
    if (visit.status === 'current') {
      return { label: 'Current', color: '#1a3b6a', bg: '#e6eefb' };
    }
    if (visit.priority) {
      return { label: 'High priority', color: '#9a6a00', bg: '#fdf3d7' };
    }
    if (visit.mode === 'cod') {
      return { label: 'COD', color: '#4b5563', bg: '#eef0f3' };
    }
    return null;
  }

  subtitle(visit: VanVisit): string {
    if (visit.status === 'done') return visit.outcome ?? '';
    if (visit.status === 'current') {
      return `ETA ${visit.eta} · window ${visit.window || '—'} · balance ${this.round(visit.balance)}`;
    }
    return `ETA ${visit.eta}`;
  }

  private round(n: number): string {
    return Math.round(n).toLocaleString('en-US');
  }

  private async toast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 1600,
      position: 'top',
      color: 'medium',
    });
    await toast.present();
  }
}

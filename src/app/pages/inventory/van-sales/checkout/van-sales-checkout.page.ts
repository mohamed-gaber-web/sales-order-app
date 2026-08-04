import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { LoadingController, ModalController, ToastController } from '@ionic/angular';
import { LookupService } from '../../../../core/services/lookup.service';
import { VanCartService } from '../../../../core/services/van-cart.service';
import { VanDayService } from '../../../../core/services/van-day.service';
import { VanSalesService } from '../../../../core/services/van-sales.service';
import { Customer } from '../../../../core/models/lookup.models';
import { Warehouse } from '../../../../models/inventory.model';
import { VanSaleResult } from '../../../../models/van-sales.model';
import { VanSalesLabelModalComponent } from '../label/van-sales-label-modal.component';

const DEFAULT_CURRENCY = 'USD';

type Picker = 'customer' | 'warehouse' | null;

@Component({
  selector: 'app-van-sales-checkout',
  templateUrl: './van-sales-checkout.page.html',
  styleUrls: ['./van-sales-checkout.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanSalesCheckoutPage implements OnInit {
  private router = inject(Router);
  private modalCtrl = inject(ModalController);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private vanSales = inject(VanSalesService);
  private lookup = inject(LookupService);
  private day = inject(VanDayService);
  readonly cart = inject(VanCartService);

  readonly customers = this.lookup.customers;
  readonly warehouses = signal<Warehouse[]>([]);

  readonly customer = signal<Customer | null>(null);
  readonly warehouse = signal<Warehouse | null>(null);

  readonly openPicker = signal<Picker>(null);
  readonly pickerSearch = signal('');

  readonly isSubmitting = signal(false);
  /** Set once the sale posts — the page switches to the receipt view. */
  readonly result = signal<VanSaleResult | null>(null);

  readonly currencyCode = computed(
    () => this.customer()?.CurrencyCode?.trim() || DEFAULT_CURRENCY
  );

  readonly canSubmit = computed(
    () => !this.cart.isEmpty() && !!this.customer() && !!this.warehouse() && !this.isSubmitting()
  );

  readonly filteredCustomers = computed(() => {
    const term = this.pickerSearch().trim().toLowerCase();
    const all = this.customers();
    if (!term) return all.slice(0, 60);
    return all
      .filter(
        (c) =>
          c.CustomerAccount.toLowerCase().includes(term) ||
          (c.CustomerName ?? '').toLowerCase().includes(term)
      )
      .slice(0, 60);
  });

  readonly filteredWarehouses = computed(() => {
    const term = this.pickerSearch().trim().toLowerCase();
    const all = this.warehouses();
    if (!term) return all.slice(0, 60);
    return all
      .filter(
        (w) =>
          w.WarehouseId.toLowerCase().includes(term) ||
          (w.WarehouseName ?? '').toLowerCase().includes(term)
      )
      .slice(0, 60);
  });

  ngOnInit() {
    if (this.cart.isEmpty()) {
      this.router.navigate(['/inventory/van-sales/catalog']);
      return;
    }
    this.preselectVisitCustomer();
    this.vanSales.getWarehouses().subscribe({
      next: (list) => this.warehouses.set(list),
      error: () => this.warehouses.set([]),
    });
  }

  /**
   * When the driver reached checkout from a visit, pre-pick that customer so they
   * don't re-select who they're standing in front of. Only fires on an exact
   * account match against the live lookup — the seeded route accounts may not
   * exist in this tenant, in which case the driver picks as before.
   */
  private preselectVisitCustomer() {
    const account = this.day.currentVisit()?.account;
    if (!account) return;
    const match = this.customers().find((c) => c.CustomerAccount === account);
    if (match) this.customer.set(match);
  }

  // ── Pickers ────────────────────────────────────────────────────────────────

  open(picker: Exclude<Picker, null>) {
    this.pickerSearch.set('');
    this.openPicker.set(picker);
  }

  closePicker() {
    this.openPicker.set(null);
  }

  onPickerSearch(term: string) {
    this.pickerSearch.set(term);
  }

  selectCustomer(customer: Customer) {
    this.customer.set(customer);
    this.closePicker();
  }

  selectWarehouse(warehouse: Warehouse) {
    this.warehouse.set(warehouse);
    this.closePicker();
  }

  // ── Receive ────────────────────────────────────────────────────────────────

  async receive() {
    const customer = this.customer();
    const warehouse = this.warehouse();
    if (!this.canSubmit() || !customer || !warehouse) return;

    this.isSubmitting.set(true);
    const loading = await this.loadingCtrl.create({
      message: 'Recording sale...',
      spinner: 'crescent',
    });
    await loading.present();

    const lines = this.cart.lines().map((l) => ({ ...l }));

    this.vanSales
      .checkout(
        {
          customerAccount: customer.CustomerAccount,
          customerName: customer.CustomerName ?? customer.CustomerAccount,
          currencyCode: this.currencyCode(),
          // Warehouses carry their site, so the driver picks one thing, not two.
          siteId: warehouse.OperationalSiteId ?? '',
          warehouseId: warehouse.WarehouseId,
        },
        lines
      )
      .subscribe({
        next: async (result) => {
          this.isSubmitting.set(false);
          await loading.dismiss();
          this.result.set(result);
          // Fold the sale into the day: the current visit is marked done and the
          // invoice booked as an open receivable so a later collection can settle
          // it. A no-op when checkout wasn't reached from a visit.
          this.day.recordSale(result);
          // The sale is posted — holding the cart would let it be sold twice.
          this.cart.clear();
          if (result.failedItems.length > 0) {
            await this.toast(
              `Order ${result.orderNumber} created, but these lines failed: ${result.failedItems.join(', ')}. Add them in D365.`,
              'warning',
              7000
            );
          }
        },
        error: async (err) => {
          this.isSubmitting.set(false);
          await loading.dismiss();
          const detail = this.extractErrorMessage(err);
          await this.toast(
            detail
              ? `Couldn't record the sale: ${detail}`
              : "Couldn't record the sale. Your cart is untouched — try again.",
            'danger',
            7000
          );
        },
      });
  }

  private extractErrorMessage(err: unknown): string {
    const e = err as {
      error?: { error?: { message?: string }; Message?: string; message?: string };
      message?: string;
    };
    return e?.error?.error?.message ?? e?.error?.Message ?? e?.error?.message ?? e?.message ?? '';
  }

  // ── After the sale ─────────────────────────────────────────────────────────

  async printLabel() {
    const result = this.result();
    if (!result) return;

    const modal = await this.modalCtrl.create({
      component: VanSalesLabelModalComponent,
      componentProps: { sale: result },
      cssClass: 'label-preview-modal',
      breakpoints: [0, 0.9],
      initialBreakpoint: 0.9,
    });
    await modal.present();
  }

  viewOrder() {
    const result = this.result();
    if (!result) return;
    this.router.navigate(['/sales-order-line/detail', result.orderNumber]);
  }

  /** Returns to the visit the sale was made at, or the journey if there isn't one. */
  startNewSale() {
    this.result.set(null);
    this.customer.set(null);
    const visitId = this.day.currentVisit()?.id;
    this.router.navigate(
      visitId != null
        ? ['/inventory/van-sales/visit', visitId]
        : ['/inventory/van-sales']
    );
  }

  backToCart() {
    this.router.navigate(['/inventory/van-sales/cart']);
  }

  private async toast(message: string, color: 'warning' | 'danger', duration: number) {
    const toast = await this.toastCtrl.create({
      message,
      duration,
      color,
      position: 'bottom',
      buttons: [{ text: 'Dismiss', role: 'cancel' }],
    });
    await toast.present();
  }
}

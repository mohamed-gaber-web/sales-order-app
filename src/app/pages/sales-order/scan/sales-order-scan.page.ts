import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LoadingController, ModalController, ToastController } from '@ionic/angular';
import { forkJoin } from 'rxjs';
import { Currency, Customer } from '../../../core/models/lookup.models';
import { LookupService } from '../../../core/services/lookup.service';
import { InventoryService } from '../../../core/services/inventory.service';
import {
  SalesOrderLineService,
  Site,
  Warehouse,
} from '../../../core/services/sales-order-line.service';
import { SalesOrderService } from '../../../core/services/sales-order.service';
import { ScannerModalComponent } from '../../inventory/scanner/scanner-modal.component';

/** One scanned line being built before submission (view state only) */
interface ScanLine {
  itemNumber: string;
  productName: string;
  quantity: number;
  price: number;
  configurationId: string;
  sizeId: string;
  colorId: string;
  styleId: string;
  availableConfigurations: string[];
  availableSizes: string[];
  availableColors: string[];
  availableStyles: string[];
}

@Component({
  selector: 'app-sales-order-scan',
  templateUrl: './sales-order-scan.page.html',
  styleUrls: ['./sales-order-scan.page.scss'],
  standalone: false,
})
export class SalesOrderScanPage implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private modalCtrl = inject(ModalController);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private lookupService = inject(LookupService);
  private inventoryService = inject(InventoryService);
  private orderLineService = inject(SalesOrderLineService);
  private salesOrderService = inject(SalesOrderService);

  headerForm: FormGroup;
  lines: ScanLine[] = [];

  isLoading = false;
  isResolving = false;
  isSubmitting = false;

  readonly currencies = this.lookupService.currencies;
  readonly customers = this.lookupService.customers;
  sites: Site[] = [];
  allWarehouses: Warehouse[] = [];

  filteredCurrencies: Currency[] = [];
  filteredCustomers: Customer[] = [];
  filteredSites: Site[] = [];
  filteredWarehouses: Warehouse[] = [];
  showCurrencyPopover = false;
  showCustomerPopover = false;
  showSitePopover = false;
  showWarehousePopover = false;

  constructor() {
    this.headerForm = this.fb.group({
      SalesOrderNumber: ['', Validators.required],
      CurrencyCode: ['', Validators.required],
      OrderingCustomerAccountNumber: ['', Validators.required],
      ShippingSiteId: ['', Validators.required],
      ShippingWarehouseId: ['', Validators.required],
    });
  }

  ngOnInit() {
    this.loadLookups();
  }

  get totalQuantity(): number {
    // ion-input[type=number] can hand back strings through ngModel — coerce
    return this.lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  }

  get canSubmit(): boolean {
    return this.headerForm.valid && this.lines.length > 0 && !this.isSubmitting;
  }

  private loadLookups() {
    this.isLoading = true;
    forkJoin([
      this.lookupService.loadCurrencies(),
      this.lookupService.loadCustomers(),
      this.orderLineService.getSites(),
      this.orderLineService.getWarehouses(),
    ]).subscribe({
      next: ([, , sitesRes, warehousesRes]) => {
        this.sites = sitesRes.value;
        this.filteredSites = this.sites;
        this.allWarehouses = warehousesRes.value;
        this.filteredWarehouses = this.allWarehouses;
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        await this.showToast('Couldn\'t load form data. Try again.', 'danger');
      },
    });
  }

  // ── Scanning ─────────────────────────────────────────────
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
      this.addScannedItem(data.trim());
    }
  }

  private addScannedItem(itemNumber: string) {
    if (!itemNumber || this.isResolving) {
      return;
    }

    const existing = this.lines.find(
      (l) => l.itemNumber.toLowerCase() === itemNumber.toLowerCase()
    );
    if (existing) {
      existing.quantity = (Number(existing.quantity) || 0) + 1;
      this.showToast(`${existing.itemNumber} quantity: ${existing.quantity}`, 'success');
      return;
    }

    this.isResolving = true;
    forkJoin([
      this.inventoryService.getProductByNumber(itemNumber),
      this.orderLineService.getProductVariants(itemNumber),
    ]).subscribe({
      next: ([productRes, variantsRes]) => {
        this.isResolving = false;
        const product = productRes.value[0];
        if (!product) {
          this.showToast(`No item found for "${itemNumber}".`, 'danger');
          return;
        }

        const unique = (values: (string | undefined)[]) =>
          [...new Set(values.filter((v): v is string => !!v))];
        const configurations = unique(variantsRes.value.map((v) => v.ProductConfigurationId));
        const sizes = unique(variantsRes.value.map((v) => v.ProductSizeId));
        const colors = unique(variantsRes.value.map((v) => v.ProductColorId));
        const styles = unique(variantsRes.value.map((v) => v.ProductStyleId));

        this.lines.push({
          itemNumber: product.ProductNumber,
          productName: product.ProductName || product.ProductSearchName || '',
          quantity: 1,
          price: 0,
          configurationId: configurations[0] ?? '',
          sizeId: sizes[0] ?? '',
          colorId: colors[0] ?? '',
          styleId: styles[0] ?? '',
          availableConfigurations: configurations,
          availableSizes: sizes,
          availableColors: colors,
          availableStyles: styles,
        });
        this.showToast(`${product.ProductNumber} added.`, 'success');
      },
      error: async () => {
        this.isResolving = false;
        await this.showToast(`Couldn't look up "${itemNumber}". Try again.`, 'danger');
      },
    });
  }

  // ── Line editing ─────────────────────────────────────────
  increaseQuantity(line: ScanLine) {
    line.quantity = (Number(line.quantity) || 0) + 1;
  }

  decreaseQuantity(line: ScanLine) {
    const qty = Number(line.quantity) || 1;
    if (qty > 1) {
      line.quantity = qty - 1;
    }
  }

  removeLine(index: number) {
    this.lines.splice(index, 1);
  }

  // ── Submit ───────────────────────────────────────────────
  async onSubmit() {
    if (this.headerForm.invalid) {
      this.headerForm.markAllAsTouched();
      await this.showToast('Fill in all required fields to continue.', 'danger');
      return;
    }
    if (this.lines.length === 0) {
      await this.showToast('Scan at least one item to continue.', 'danger');
      return;
    }

    this.isSubmitting = true;
    const loading = await this.loadingCtrl.create({
      message: 'Creating order...',
      spinner: 'crescent',
    });
    await loading.present();

    const form = this.headerForm.value;
    const header = {
      dataAreaId: 'usmf',
      SalesOrderNumber: form.SalesOrderNumber,
      CurrencyCode: form.CurrencyCode,
      OrderingCustomerAccountNumber: form.OrderingCustomerAccountNumber,
    };
    const linePayloads = this.lines.map((l) => ({
      ItemNumber: l.itemNumber,
      OrderedSalesQuantity: Number(l.quantity) || 1,
      SalesPrice: Number(l.price) || 0,
      ShippingSiteId: form.ShippingSiteId,
      ShippingWarehouseId: form.ShippingWarehouseId,
      ProductConfigurationId: l.configurationId,
      ProductSizeId: l.sizeId,
      ProductColorId: l.colorId,
      ProductStyleId: l.styleId,
    }));

    this.salesOrderService.createOrderWithLines(header, linePayloads).subscribe({
      next: async ({ orderNumber, failedItems }) => {
        this.isSubmitting = false;
        await loading.dismiss();
        if (failedItems.length === 0) {
          await this.showToast(`Order ${orderNumber} created with ${linePayloads.length} lines.`, 'success');
        } else {
          await this.showToast(
            `Order ${orderNumber} created, but these lines failed: ${failedItems.join(', ')}.`,
            'warning'
          );
        }
        this.router.navigate(['/sales-order-line/detail', orderNumber]);
      },
      error: async () => {
        this.isSubmitting = false;
        await loading.dismiss();
        await this.showToast('Couldn\'t create order. Try again.', 'danger');
      },
    });
  }

  // ── Header pickers ───────────────────────────────────────
  onCurrencySearch(term: string) {
    const lower = term.toLowerCase();
    this.filteredCurrencies = this.currencies().filter(
      (c) =>
        c.CurrencyCode.toLowerCase().includes(lower) ||
        (c.Name && c.Name.toLowerCase().includes(lower))
    );
  }

  selectCurrency(currency: Currency) {
    this.headerForm.patchValue({ CurrencyCode: currency.CurrencyCode });
    this.showCurrencyPopover = false;
  }

  onCustomerSearch(term: string) {
    const lower = term.toLowerCase();
    this.filteredCustomers = this.customers().filter(
      (c) =>
        c.CustomerAccount.toLowerCase().includes(lower) ||
        (c.CustomerName && c.CustomerName.toLowerCase().includes(lower))
    );
  }

  selectCustomer(customer: Customer) {
    this.headerForm.patchValue({ OrderingCustomerAccountNumber: customer.CustomerAccount });
    this.showCustomerPopover = false;
  }

  onSiteSearch(term: string) {
    const lower = term.toLowerCase();
    this.filteredSites = this.sites.filter(
      (s) =>
        s.SiteId.toLowerCase().includes(lower) ||
        (s.SiteName && s.SiteName.toLowerCase().includes(lower))
    );
  }

  selectSite(site: Site) {
    this.headerForm.patchValue({ ShippingSiteId: site.SiteId });
    this.showSitePopover = false;
  }

  onWarehouseSearch(term: string) {
    const lower = term.toLowerCase();
    this.filteredWarehouses = this.allWarehouses.filter(
      (w) =>
        w.WarehouseId.toLowerCase().includes(lower) ||
        (w.WarehouseName && w.WarehouseName.toLowerCase().includes(lower))
    );
  }

  selectWarehouse(wh: Warehouse) {
    this.headerForm.patchValue({ ShippingWarehouseId: wh.WarehouseId });
    this.showWarehousePopover = false;
  }

  closePopovers() {
    this.showCurrencyPopover = false;
    this.showCustomerPopover = false;
    this.showSitePopover = false;
    this.showWarehousePopover = false;
  }

  goBack() {
    this.router.navigate(['/sales-order/list']);
  }

  private async showToast(
    message: string,
    color: 'success' | 'danger' | 'warning'
  ) {
    const toast = await this.toastCtrl.create({
      message,
      color,
      position: 'bottom',
      buttons: [{ text: 'Dismiss', role: 'cancel' }],
    });
    await toast.present();
  }
}

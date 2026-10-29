import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LoadingController, ModalController, ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { forkJoin, from, Observable, of } from 'rxjs';
import { catchError, concatMap, map, switchMap, toArray } from 'rxjs/operators';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { InventoryService, ScannedItem } from '../../../core/services/inventory.service';
import { ScannerModalComponent } from '../../inventory/scanner/scanner-modal.component';
import { ProductVariant, SalesOrderLineService, Warehouse } from '../../../core/services/sales-order-line.service';
import { TenantConfigStore } from '../../../core/tenant/tenant-config.store';
import { InventoryProduct } from '../../../models/inventory.model';
import { Vendor } from '../../../models/purchase-order.model';
import {
  buildHeaderPayload,
  buildLinePayload,
  PO_CURRENCY,
  PurchaseOrderLineInput,
  PurchaseOrderReceiving,
} from './purchase-order-payload';

type Picker = 'vendor' | 'warehouse';

interface PendingLine extends PurchaseOrderLineInput {
  /** D365's reason, set when this line was rejected on the last submit. */
  error?: string;
}

interface LineResult {
  line: PendingLine;
  error: string | null;
}

const VARIANT_FIELDS = ['ProductConfigurationId', 'ProductSizeId', 'ProductColorId', 'ProductStyleId'] as const;

/** Enough to find a vendor by typing; the full list can run to thousands. */
const VENDOR_RESULTS = 50;

/** Today plus `days` on the local calendar, as the yyyy-MM-dd an `<input type="date">` holds. */
function isoDate(days = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function d365Message(err: any): string {
  return err?.error?.error?.message ?? err?.error?.message ?? err?.message ?? '';
}

@Component({
  selector: 'app-purchase-order-create',
  templateUrl: './purchase-order-create.page.html',
  styleUrls: [
    '../../sales-order-line/form/sales-order-line-form.page.scss',
    '../../transfer-order/create/transfer-order-create.page.scss',
  ],
  standalone: false,
})
export class PurchaseOrderCreatePage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly loadingCtrl = inject(LoadingController);
  private readonly toastCtrl = inject(ToastController);
  private readonly modalCtrl = inject(ModalController);
  private readonly translate = inject(TranslateService);
  private readonly poService = inject(PurchaseOrderService);
  private readonly inventoryService = inject(InventoryService);
  private readonly orderLineService = inject(SalesOrderLineService);
  private readonly tenantConfig = inject(TenantConfigStore);

  readonly currencyCode = PO_CURRENCY;
  readonly today = isoDate();

  readonly headerForm: FormGroup = this.fb.group({
    OrderVendorAccountNumber: ['', Validators.required],
    ReceivingWarehouseId: ['', Validators.required],
    ReceivingWarehouseLocationId: [''],
    RequestedDeliveryDate: [isoDate(7), Validators.required],
  });

  readonly lineForm: FormGroup = this.fb.group({
    ItemNumber: ['', Validators.required],
    VariantIndex: [null as number | null],
    OrderedPurchaseQuantity: [1, [Validators.required, Validators.min(0.01)]],
    PurchasePrice: [null as number | null, Validators.min(0)],
  });

  lines: PendingLine[] = [];

  /**
   * D365 takes the line number from the request. Assigned when a line is
   * added and kept through a retry, so a line accepted on the first submit
   * and one retried later can never claim the same number.
   */
  private nextLineNumber = 1;

  /**
   * Set once D365 has accepted the header but some lines are still pending.
   * The header is then locked and a retry posts only the lines.
   */
  createdOrderNumber: string | null = null;

  isLoading = false;
  loadFailed = false;
  isSubmitting = false;

  vendors: Vendor[] = [];
  filteredVendors: Vendor[] = [];
  warehouses: Warehouse[] = [];
  filteredWarehouses: Warehouse[] = [];
  openPicker: Picker | null = null;
  /** Set when the picked warehouse has no site, so it could not be used. */
  warehouseWithoutSite: string | null = null;
  pickerSearch = '';

  itemResults: InventoryProduct[] = [];
  showItemDropdown = false;
  isSearchingItems = false;
  private itemSearchSeq = 0;

  /** The item picked from the search results; a typed-only number is not accepted. */
  selectedItem: string | null = null;
  variants: ProductVariant[] = [];
  isLoadingVariants = false;
  variantsFailed = false;
  isResolvingScan = false;

  get canAddLine(): boolean {
    const v = this.lineForm.getRawValue();
    return (
      this.lineForm.valid &&
      !!this.selectedItem &&
      this.selectedItem === v.ItemNumber &&
      !this.isLoadingVariants &&
      !this.variantsFailed &&
      (this.variants.length === 0 || v.VariantIndex !== null)
    );
  }

  get canSubmit(): boolean {
    // A locked (disabled) header form reports valid === false, so it counts as valid here.
    const headerOk = !!this.createdOrderNumber || this.headerForm.valid;
    return headerOk && this.lines.length > 0 && !this.isSubmitting;
  }

  get itemNotPicked(): boolean {
    const typed = this.lineForm.get('ItemNumber')?.value;
    return !!typed && typed !== this.selectedItem && !this.showItemDropdown;
  }

  ngOnInit() {
    this.loadLookups();
  }

  loadLookups() {
    this.isLoading = true;
    this.loadFailed = false;
    forkJoin([this.poService.getVendors(), this.orderLineService.getWarehouses()]).subscribe({
      next: ([vendors, warehousesRes]) => {
        this.vendors = vendors;
        this.warehouses = warehousesRes.value;
        if (!this.headerForm.value.ReceivingWarehouseId) {
          const assigned = this.tenantConfig.pickDefaultWarehouse(this.warehouses);
          if (assigned) this.selectWarehouse(assigned);
        }
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.loadFailed = true;
      },
    });
  }

  // ── Vendor / warehouse pickers ────────────────────────────
  togglePicker(picker: Picker) {
    if (this.createdOrderNumber) return;
    this.openPicker = this.openPicker === picker ? null : picker;
    this.onPickerSearch('');
  }

  onPickerSearch(term: string) {
    this.pickerSearch = term;
    const lower = term.toLowerCase();
    if (this.openPicker === 'vendor') {
      this.filteredVendors = this.vendors
        .filter(
          (v) =>
            v.VendorAccountNumber.toLowerCase().includes(lower) ||
            (v.VendorOrganizationName ?? '').toLowerCase().includes(lower)
        )
        .slice(0, VENDOR_RESULTS);
    } else {
      this.filteredWarehouses = this.warehouses.filter(
        (w) =>
          w.WarehouseId.toLowerCase().includes(lower) ||
          (w.WarehouseName ?? '').toLowerCase().includes(lower)
      );
    }
  }

  selectVendor(vendor: Vendor) {
    this.headerForm.patchValue({ OrderVendorAccountNumber: vendor.VendorAccountNumber });
    this.openPicker = null;
  }

  selectWarehouse(wh: Warehouse) {
    // Header and lines both need the warehouse's site; without one D365 rejects the order.
    this.warehouseWithoutSite = wh.OperationalSiteId ? null : wh.WarehouseId;
    this.headerForm.patchValue({ ReceivingWarehouseId: wh.OperationalSiteId ? wh.WarehouseId : '' });
    this.openPicker = null;
  }

  vendorLabel(account: string): string {
    const v = this.vendors.find((x) => x.VendorAccountNumber === account);
    return v?.VendorOrganizationName ? `${v.VendorAccountNumber} – ${v.VendorOrganizationName}` : account;
  }

  warehouseLabel(id: string): string {
    const wh = this.warehouses.find((w) => w.WarehouseId === id);
    return wh?.WarehouseName ? `${wh.WarehouseId} – ${wh.WarehouseName}` : id;
  }

  // ── Item search (autocomplete) ────────────────────────────
  onItemNumberInput(term: string) {
    const trimmed = term.trim();
    // Editing the item after picking one discards that item's variants,
    // otherwise item A's size could be posted against item B.
    if (trimmed === this.selectedItem) return; // already picked (or just scanned) — nothing to search
    this.clearItemSelection();

    const seq = ++this.itemSearchSeq;
    if (trimmed.length < 2) {
      this.itemResults = [];
      this.showItemDropdown = false;
      this.isSearchingItems = false;
      return;
    }
    this.isSearchingItems = true;
    this.showItemDropdown = true;
    this.inventoryService.searchProducts(trimmed).subscribe({
      next: (products) => {
        if (seq !== this.itemSearchSeq) return; // stale response, a newer search is running
        this.itemResults = products;
        this.isSearchingItems = false;
      },
      error: () => {
        if (seq !== this.itemSearchSeq) return;
        this.itemResults = [];
        this.isSearchingItems = false;
      },
    });
  }

  selectItem(product: InventoryProduct, preselect?: ScannedItem['variant']) {
    this.lineForm.patchValue({ ItemNumber: product.ProductNumber });
    this.selectedItem = product.ProductNumber;
    this.showItemDropdown = false;
    this.itemResults = [];
    this.loadVariants(product.ProductNumber, preselect);
  }

  // ── Scan ──────────────────────────────────────────────────
  async scanItem() {
    const modal = await this.modalCtrl.create({
      component: ScannerModalComponent,
      cssClass: 'scanner-modal',
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<string>();
    if (data) this.applyScan(data);
  }

  /** A keyboard-wedge scanner types the code and presses Enter into the item field. */
  onItemEnter(event: Event) {
    event.preventDefault();
    const typed = String(this.lineForm.get('ItemNumber')?.value ?? '').trim();
    if (typed && typed !== this.selectedItem) this.applyScan(typed);
  }

  private applyScan(code: string) {
    this.isResolvingScan = true;
    this.showItemDropdown = false;
    this.itemSearchSeq++; // drop any search still in flight for the typed text
    this.inventoryService.findItemByScan(code).subscribe({
      next: (hit) => {
        this.isResolvingScan = false;
        if (hit) {
          this.selectItem(hit.product, hit.variant);
        } else {
          this.showToast(this.translate.instant('poCreate.scanNoMatch', { code }), 'warning');
        }
      },
      error: () => {
        this.isResolvingScan = false;
        this.showToast(this.translate.instant('poCreate.scanNoMatch', { code }), 'warning');
      },
    });
  }

  onItemInputBlur() {
    // Delay so a tap on a result registers before the list hides
    setTimeout(() => (this.showItemDropdown = false), 200);
  }

  retryVariants() {
    if (this.selectedItem) this.loadVariants(this.selectedItem);
  }

  /** Variants are offered as the combinations D365 actually has, not four independent lists. */
  private loadVariants(itemNumber: string, preselect?: ScannedItem['variant']) {
    this.isLoadingVariants = true;
    this.variantsFailed = false;
    this.variants = [];
    this.lineForm.patchValue({ VariantIndex: null });
    this.orderLineService.getProductVariants(itemNumber).subscribe({
      next: (res) => {
        if (this.selectedItem !== itemNumber) return; // item changed while loading
        this.variants = res.value;
        this.isLoadingVariants = false;
        if (preselect) {
          // A scanned barcode names one variant — pick it so the operator only confirms.
          const index = this.variants.findIndex((v) => VARIANT_FIELDS.every((f) => (v[f] ?? '') === preselect[f]));
          if (index >= 0) this.lineForm.patchValue({ VariantIndex: index });
        }
      },
      error: () => {
        if (this.selectedItem !== itemNumber) return;
        this.isLoadingVariants = false;
        this.variantsFailed = true;
      },
    });
  }

  private clearItemSelection() {
    this.selectedItem = null;
    this.variants = [];
    this.variantsFailed = false;
    this.isLoadingVariants = false;
    this.lineForm.patchValue({ VariantIndex: null }, { emitEvent: false });
  }

  variantLabel(v: Partial<PurchaseOrderLineInput>): string {
    return VARIANT_FIELDS.map((f) => v[f]).filter((x) => !!x).join(' · ');
  }

  // ── Pending lines ─────────────────────────────────────────
  addLine() {
    if (!this.canAddLine) {
      this.lineForm.markAllAsTouched();
      return;
    }
    const v = this.lineForm.getRawValue();
    const variant = v.VariantIndex !== null ? this.variants[v.VariantIndex] : undefined;
    const price = v.PurchasePrice;
    const line: PendingLine = {
      LineNumber: this.nextLineNumber++,
      ItemNumber: this.selectedItem!,
      PurchasePrice: price === null || price === '' || price === undefined ? null : Number(price),
      OrderedPurchaseQuantity: Number(v.OrderedPurchaseQuantity),
      ProductConfigurationId: variant?.ProductConfigurationId ?? '',
      ProductSizeId: variant?.ProductSizeId ?? '',
      ProductColorId: variant?.ProductColorId ?? '',
      ProductStyleId: variant?.ProductStyleId ?? '',
    };
    this.lines = [...this.lines, line];
    this.lineForm.reset({ ItemNumber: '', VariantIndex: null, OrderedPurchaseQuantity: 1, PurchasePrice: null });
    this.clearItemSelection();
  }

  removeLine(index: number) {
    this.lines = this.lines.filter((_, i) => i !== index);
  }

  // ── Submit ────────────────────────────────────────────────
  /**
   * Header first — D365 assigns the order number — then each line in turn,
   * one at a time, in the order they were added. Every line receives into the
   * chosen warehouse, its site and (if given) location, on the delivery date.
   *
   * Lines that fail stay on the form with D365's reason so they can be fixed
   * and retried against the same order. If not one line made it in, the
   * header just created is deleted again rather than left as an empty order.
   */
  async onSubmit() {
    if (!this.canSubmit) {
      this.headerForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const loading = await this.loadingCtrl.create({
      message: this.translate.instant('poCreate.creating'),
      spinner: 'crescent',
    });
    await loading.present();

    const dataAreaId = this.tenantConfig.currentDataAreaId();
    const { OrderVendorAccountNumber, ReceivingWarehouseId, ReceivingWarehouseLocationId, RequestedDeliveryDate } =
      this.headerForm.getRawValue();
    const receiving: PurchaseOrderReceiving = {
      ReceivingWarehouseId,
      ReceivingSiteId: this.warehouses.find((w) => w.WarehouseId === ReceivingWarehouseId)?.OperationalSiteId ?? '',
      ReceivingWarehouseLocationId: ReceivingWarehouseLocationId ?? '',
      deliveryDate: RequestedDeliveryDate,
    };

    const isRetry = !!this.createdOrderNumber;
    const orderNumber$: Observable<string> = this.createdOrderNumber
      ? of(this.createdOrderNumber)
      : this.poService
          .createOrderHeader(buildHeaderPayload(dataAreaId, OrderVendorAccountNumber, isoDate(), receiving))
          .pipe(map((created) => created.PurchaseOrderNumber));

    orderNumber$
      .pipe(
        switchMap((orderNumber) =>
          from(this.lines).pipe(
            concatMap((line) => this.postLine(dataAreaId, orderNumber, receiving, line)),
            toArray(),
            map((results) => ({ orderNumber, results }))
          )
        )
      )
      .subscribe({
        next: async ({ orderNumber, results }) => {
          const failed = results.filter((r) => r.error !== null);
          if (failed.length === 0) {
            await this.finish(loading);
            this.showToast(this.translate.instant('poCreate.created', { number: orderNumber }), 'success');
            this.openOrder(orderNumber);
            return;
          }

          this.lines = failed.map((r) => ({ ...r.line, error: r.error || this.translate.instant('poCreate.lineFailed') }));

          if (!isRetry && failed.length === results.length) {
            this.rollBackHeader(orderNumber, dataAreaId, loading);
            return;
          }

          this.lockToOrder(orderNumber);
          await this.finish(loading);
          this.showToast(
            this.translate.instant('poCreate.linesFailed', {
              number: orderNumber,
              failed: failed.length,
              count: results.length,
            }),
            'warning'
          );
        },
        error: async (err) => {
          await this.finish(loading);
          this.showToast(d365Message(err) || this.translate.instant('poCreate.failed'), 'danger');
        },
      });
  }

  private postLine(
    dataAreaId: string,
    orderNumber: string,
    receiving: PurchaseOrderReceiving,
    line: PendingLine
  ): Observable<LineResult> {
    return this.poService
      .createOrderLine(buildLinePayload(dataAreaId, orderNumber, receiving, line))
      .pipe(
        map(() => ({ line, error: null })),
        catchError((err) => of({ line, error: d365Message(err) }))
      );
  }

  private rollBackHeader(orderNumber: string, dataAreaId: string, loading: HTMLIonLoadingElement) {
    this.poService.deleteOrderHeader(orderNumber, dataAreaId).subscribe({
      next: async () => {
        await this.finish(loading);
        this.showToast(this.translate.instant('poCreate.noLinesCreated'), 'danger');
      },
      error: async () => {
        // Could not remove it: keep working against the order that exists.
        this.lockToOrder(orderNumber);
        await this.finish(loading);
        this.showToast(
          this.translate.instant('poCreate.linesFailed', {
            number: orderNumber,
            failed: this.lines.length,
            count: this.lines.length,
          }),
          'warning'
        );
      },
    });
  }

  private lockToOrder(orderNumber: string) {
    this.createdOrderNumber = orderNumber;
    this.openPicker = null;
    this.headerForm.disable();
  }

  private async finish(loading: HTMLIonLoadingElement) {
    this.isSubmitting = false;
    await loading.dismiss();
  }

  openOrder(orderNumber = this.createdOrderNumber) {
    if (!orderNumber) return;
    this.router.navigate(['/purchase-order/detail', orderNumber], { replaceUrl: true });
  }

  goBack() {
    this.router.navigate(['/purchase-order/list']);
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger') {
    const toast = await this.toastCtrl.create({
      message,
      buttons: [{ text: this.translate.instant('common.dismiss'), role: 'cancel' }],
      color,
      position: 'bottom',
      duration: color === 'success' ? 2500 : undefined,
    });
    await toast.present();
  }
}

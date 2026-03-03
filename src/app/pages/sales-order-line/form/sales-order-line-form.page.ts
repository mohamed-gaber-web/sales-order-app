import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { forkJoin } from 'rxjs';
import {
  SalesOrderLineService,
  Site,
  Warehouse,
  ProductVariant,
} from '../../../core/services/sales-order-line.service';

@Component({
  selector: 'app-sales-order-line-form',
  templateUrl: './sales-order-line-form.page.html',
  styleUrls: ['./sales-order-line-form.page.scss'],
  standalone: false,
})
export class SalesOrderLineFormPage implements OnInit {
  lineForm: FormGroup;
  isLoading = false;
  isSubmitting = false;
  isLoadingVariants = false;

  sites: Site[] = [];
  warehouses: Warehouse[] = [];
  allWarehouses: Warehouse[] = [];
  productVariants: ProductVariant[] = [];
  availableSizes: string[] = [];
  availableColors: string[] = [];
  availableStyles: string[] = [];
  availableConfigurations: string[] = [];
  variantMessage = '';

  filteredSites: Site[] = [];
  filteredWarehouses: Warehouse[] = [];
  showSitePopover = false;
  showWarehousePopover = false;

  salesOrderNumber = '';

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private orderLineService: SalesOrderLineService
  ) {
    this.lineForm = this.fb.group({
      SalesOrderNumber: ['', Validators.required],
      ItemNumber: ['', Validators.required],
      ShippingSiteId: ['', Validators.required],
      ShippingWarehouseId: ['', Validators.required],
      OrderedSalesQuantity: [null, [Validators.required, Validators.min(0.01)]],
      SalesPrice: [null, [Validators.required, Validators.min(0)]],
      ProductConfigurationId: [''],
      ProductSizeId: [''],
      ProductColorId: [''],
      ProductStyleId: [''],
    });
  }

  ngOnInit() {
    this.salesOrderNumber = this.route.snapshot.paramMap.get('salesOrderNumber') ?? '';
    if (this.salesOrderNumber) {
      this.lineForm.patchValue({ SalesOrderNumber: this.salesOrderNumber });
      this.lineForm.get('SalesOrderNumber')?.disable();
    }
    this.loadLookups();
  }

  private loadLookups() {
    this.isLoading = true;
    forkJoin([
      this.orderLineService.getSites(),
      this.orderLineService.getWarehouses(),
    ]).subscribe({
      next: ([sitesRes, warehousesRes]) => {
        this.sites = sitesRes.value;
        this.filteredSites = this.sites;
        this.allWarehouses = warehousesRes.value;
        this.filteredWarehouses = this.allWarehouses;
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        const toast = await this.toastCtrl.create({
          message: 'Failed to load lookup data. Please try again.',
          duration: 3000,
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  // ── Site search & select ──────────────────────────────────
  onSiteSearch(term: string) {
    const lower = term.toLowerCase();
    this.filteredSites = this.sites.filter(
      (s) =>
        s.SiteId.toLowerCase().includes(lower) ||
        (s.SiteName && s.SiteName.toLowerCase().includes(lower))
    );
  }

  selectSite(site: Site) {
    this.lineForm.patchValue({ ShippingSiteId: site.SiteId });
    this.showSitePopover = false;
  }

  // ── Warehouse search & select ─────────────────────────────
  onWarehouseSearch(term: string) {
    const lower = term.toLowerCase();
    this.filteredWarehouses = this.allWarehouses.filter(
      (w) =>
        w.WarehouseId.toLowerCase().includes(lower) ||
        (w.WarehouseName && w.WarehouseName.toLowerCase().includes(lower))
    );
  }

  selectWarehouse(wh: Warehouse) {
    this.lineForm.patchValue({ ShippingWarehouseId: wh.WarehouseId });
    this.showWarehousePopover = false;
  }

  searchProductVariants() {
    const itemNumber = this.lineForm.get('ItemNumber')?.value?.trim();
    if (!itemNumber) return;

    this.isLoadingVariants = true;
    this.variantMessage = '';
    this.lineForm.patchValue({ ProductConfigurationId: '', ProductSizeId: '', ProductColorId: '', ProductStyleId: '' });

    this.orderLineService.getProductVariants(itemNumber).subscribe({
      next: (res) => {
        this.productVariants = res.value;

        this.availableConfigurations = [
          ...new Set(
            res.value.map((v: any) => v.ProductConfigurationId).filter((c: string) => !!c)
          ),
        ];
        this.availableSizes = [
          ...new Set(
            res.value.map((v: any) => v.ProductSizeId).filter((s: string) => !!s)
          ),
        ];
        this.availableColors = [
          ...new Set(
            res.value.map((v: any) => v.ProductColorId).filter((c: string) => !!c)
          ),
        ];
        this.availableStyles = [
          ...new Set(
            res.value.map((v: any) => v.ProductStyleId).filter((s: string) => !!s)
          ),
        ];

        const toggleCtrl = (name: string, hasData: boolean) => {
          const ctrl = this.lineForm.get(name);
          hasData ? ctrl?.enable() : ctrl?.disable();
        };
        toggleCtrl('ProductConfigurationId', this.availableConfigurations.length > 0);
        toggleCtrl('ProductSizeId', this.availableSizes.length > 0);
        toggleCtrl('ProductColorId', this.availableColors.length > 0);
        toggleCtrl('ProductStyleId', this.availableStyles.length > 0);

        this.isLoadingVariants = false;

        if (res.value.length === 0) {
          this.variantMessage = `No variants found for "${itemNumber}"`;
        } else {
          const parts: string[] = [];
          if (this.availableColors.length) parts.push(`${this.availableColors.length} colors`);
          if (this.availableSizes.length) parts.push(`${this.availableSizes.length} sizes`);
          this.variantMessage = `Found ${res.value.length} variants` +
            (parts.length ? ` (${parts.join(', ')})` : '');
        }
      },
      error: async () => {
        this.isLoadingVariants = false;
        this.productVariants = [];
        this.availableConfigurations = [];
        this.availableSizes = [];
        this.availableColors = [];
        this.availableStyles = [];
        this.variantMessage = '';
        this.lineForm.get('ProductConfigurationId')?.enable();
        this.lineForm.get('ProductSizeId')?.enable();
        this.lineForm.get('ProductColorId')?.enable();
        this.lineForm.get('ProductStyleId')?.enable();
        const toast = await this.toastCtrl.create({
          message: 'Failed to load product variants.',
          duration: 3000,
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  async onSubmit() {
    if (this.lineForm.invalid) {
      this.lineForm.markAllAsTouched();
      const toast = await this.toastCtrl.create({
        message: 'Please fill in all required fields',
        duration: 2000,
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    this.isSubmitting = true;
    const loading = await this.loadingCtrl.create({
      message: 'Creating sales order line...',
      spinner: 'crescent',
    });
    await loading.present();

    const payload = {
      dataAreaId: 'usmf',
      ...this.lineForm.getRawValue(),
    };

    this.orderLineService.createOrderLine(payload).subscribe({
      next: async () => {
        this.isSubmitting = false;
        await loading.dismiss();
        const toast = await this.toastCtrl.create({
          message: 'Sales order line created successfully',
          duration: 2000,
          color: 'success',
          position: 'bottom',
        });
        await toast.present();
        this.router.navigate(['/sales-order-line/detail', this.salesOrderNumber]);
      },
      error: async () => {
        this.isSubmitting = false;
        await loading.dismiss();
        const toast = await this.toastCtrl.create({
          message: 'Failed to create sales order line. Please try again.',
          duration: 3000,
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  goBack() {
    this.router.navigate(['/sales-order/list']);
  }
}

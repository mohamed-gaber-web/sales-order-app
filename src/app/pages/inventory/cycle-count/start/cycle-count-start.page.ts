import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { forkJoin } from 'rxjs';
import { CycleCountService } from '../../../../core/services/cycle-count.service';
import { SalesOrderLineService, Site, Warehouse } from '../../../../core/services/sales-order-line.service';

@Component({
  selector: 'app-cycle-count-start',
  templateUrl: './cycle-count-start.page.html',
  styleUrls: ['./cycle-count-start.page.scss'],
  standalone: false,
})
export class CycleCountStartPage implements OnInit {
  siteId = '';
  siteName = '';
  warehouseId = '';
  warehouseName = '';
  journalNameId = 'Cycle';
  description = '';
  countedBy = '';

  submitted = false;
  isLoadingLookups = false;

  sites: Site[] = [];
  filteredSites: Site[] = [];
  showSitePicker = false;

  private allWarehouses: Warehouse[] = [];
  filteredWarehouses: Warehouse[] = [];
  showWarehousePicker = false;

  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private cycleCountService = inject(CycleCountService);
  private lineService = inject(SalesOrderLineService);

  ngOnInit() {
    this.loadLookups();
  }

  private loadLookups() {
    this.isLoadingLookups = true;
    forkJoin([this.lineService.getSites(), this.lineService.getWarehouses()]).subscribe({
      next: ([sitesRes, warehousesRes]) => {
        this.sites = sitesRes.value;
        this.filteredSites = this.sites;
        this.allWarehouses = warehousesRes.value;
        this.filteredWarehouses = this.allWarehouses;
        this.restoreLastUsed();
        this.isLoadingLookups = false;
      },
      error: async () => {
        this.isLoadingLookups = false;
        const toast = await this.toastCtrl.create({
          message: 'Could not load sites and warehouses. Go back and try again.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  /** Pre-selects the last-used site/warehouse only if they still exist in the fetched lists. */
  private restoreLastUsed() {
    const lastSite = this.sites.find((s) => s.SiteId === this.cycleCountService.getLastUsedSite());
    if (lastSite) this.selectSite(lastSite, false);

    const lastWarehouseId = this.cycleCountService.getLastUsedWarehouse();
    const lastWarehouse = this.allWarehouses.find(
      (w) => w.WarehouseId === lastWarehouseId && (!lastSite || !w.OperationalSiteId || w.OperationalSiteId === lastSite.SiteId)
    );
    if (lastWarehouse) this.selectWarehouse(lastWarehouse, false);
  }

  // ── Site picker ─────────────────────────────────────────────
  toggleSitePicker() {
    this.showWarehousePicker = false;
    this.showSitePicker = !this.showSitePicker;
    this.onSiteSearch('');
  }

  onSiteSearch(term: string) {
    const lower = term.toLowerCase();
    this.filteredSites = this.sites.filter(
      (s) => s.SiteId.toLowerCase().includes(lower) || (s.SiteName ?? '').toLowerCase().includes(lower)
    );
  }

  selectSite(site: Site, closePicker = true) {
    const changedSite = this.siteId !== site.SiteId;
    this.siteId = site.SiteId;
    this.siteName = site.SiteName;
    if (closePicker) this.showSitePicker = false;

    // A warehouse picked under a different site may no longer belong to this one.
    if (changedSite && this.warehouseId) {
      const stillValid = this.allWarehouses.some(
        (w) => w.WarehouseId === this.warehouseId && (!w.OperationalSiteId || w.OperationalSiteId === site.SiteId)
      );
      if (!stillValid) {
        this.warehouseId = '';
        this.warehouseName = '';
      }
    }
    this.onWarehouseSearch('');
  }

  // ── Warehouse picker (cascades to the selected site, falls back to all) ─────
  toggleWarehousePicker() {
    this.showSitePicker = false;
    this.showWarehousePicker = !this.showWarehousePicker;
    this.onWarehouseSearch('');
  }

  private warehouseCandidates(): Warehouse[] {
    if (!this.siteId) return this.allWarehouses;
    const forSite = this.allWarehouses.filter((w) => w.OperationalSiteId === this.siteId);
    return forSite.length > 0 ? forSite : this.allWarehouses;
  }

  onWarehouseSearch(term: string) {
    const lower = term.toLowerCase();
    this.filteredWarehouses = this.warehouseCandidates().filter(
      (w) => w.WarehouseId.toLowerCase().includes(lower) || (w.WarehouseName ?? '').toLowerCase().includes(lower)
    );
  }

  selectWarehouse(wh: Warehouse, closePicker = true) {
    this.warehouseId = wh.WarehouseId;
    this.warehouseName = wh.WarehouseName;
    if (closePicker) this.showWarehousePicker = false;
  }

  fieldInvalid(value: string): boolean {
    if (!this.submitted) return false;
    return !value.trim();
  }

  get isValid(): boolean {
    return !!(this.siteId.trim() && this.warehouseId.trim() && this.journalNameId.trim());
  }

  startScanning() {
    this.submitted = true;
    if (!this.isValid) return;

    this.cycleCountService.saveLastUsed(this.siteId.trim(), this.warehouseId.trim());

    this.router.navigate(['/inventory/cycle-count/count-by-barcode/scan'], {
      state: {
        siteId: this.siteId.trim(),
        warehouseId: this.warehouseId.trim(),
        journalNameId: this.journalNameId.trim(),
        description: this.description.trim(),
        countedBy: this.countedBy.trim(),
      },
    });
  }
}

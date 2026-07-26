import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { forkJoin } from 'rxjs';
import { SalesOrderLineService, Site, Warehouse } from '../../../../core/services/sales-order-line.service';
import { TransferJournalService } from '../../../../core/services/transfer-journal.service';
import { WarehouseLocation } from '../../../../models/inventory.model';

type Side = 'from' | 'to';

interface SideState {
  siteId: string;
  siteName: string;
  warehouseId: string;
  warehouseName: string;
  locationId: string;
  filteredSites: Site[];
  filteredWarehouses: Warehouse[];
  filteredLocations: WarehouseLocation[];
  showSitePicker: boolean;
  showWarehousePicker: boolean;
  showLocationPicker: boolean;
  isLoadingLocations: boolean;
}

function emptySideState(): SideState {
  return {
    siteId: '', siteName: '', warehouseId: '', warehouseName: '', locationId: '',
    filteredSites: [], filteredWarehouses: [], filteredLocations: [],
    showSitePicker: false, showWarehousePicker: false, showLocationPicker: false,
    isLoadingLocations: false,
  };
}

@Component({
  selector: 'app-transfer-journal-from-to',
  templateUrl: './transfer-journal-from-to.page.html',
  styleUrls: ['./transfer-journal-from-to.page.scss'],
  standalone: false,
})
export class TransferJournalFromToPage implements OnInit {
  soNumber = '';
  salesOrderName = '';
  custAccount = '';

  from: SideState = emptySideState();
  to: SideState = emptySideState();

  submitted = false;
  isLoadingLookups = false;

  private sites: Site[] = [];
  private allWarehouses: Warehouse[] = [];
  private locationsCache = new Map<string, WarehouseLocation[]>();

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private lineService = inject(SalesOrderLineService);
  private transferJournalService = inject(TransferJournalService);

  ngOnInit() {
    this.soNumber = this.route.snapshot.paramMap.get('soNumber') ?? '';
    if (!this.soNumber) {
      this.router.navigate(['/inventory/transfer-journal']);
      return;
    }
    const navState = history.state as { salesOrderName?: string; custAccount?: string };
    this.salesOrderName = navState?.salesOrderName ?? '';
    this.custAccount = navState?.custAccount ?? '';
    this.loadLookups();
  }

  private loadLookups() {
    this.isLoadingLookups = true;
    forkJoin([this.lineService.getSites(), this.lineService.getWarehouses()]).subscribe({
      next: ([sitesRes, warehousesRes]) => {
        this.sites = sitesRes.value;
        this.allWarehouses = warehousesRes.value;
        this.from.filteredSites = this.sites;
        this.to.filteredSites = this.sites;
        this.from.filteredWarehouses = this.allWarehouses;
        this.to.filteredWarehouses = this.allWarehouses;
        this.isLoadingLookups = false;
      },
      error: async () => {
        this.isLoadingLookups = false;
        await this.showToast('Could not load sites and warehouses. Go back and try again.');
      },
    });
  }

  private sideOf(side: Side): SideState {
    return side === 'from' ? this.from : this.to;
  }

  // ── Site picker ─────────────────────────────────────────────
  toggleSitePicker(side: Side) {
    const s = this.sideOf(side);
    s.showWarehousePicker = false;
    s.showLocationPicker = false;
    s.showSitePicker = !s.showSitePicker;
    this.onSiteSearch(side, '');
  }

  onSiteSearch(side: Side, term: string) {
    const s = this.sideOf(side);
    const lower = term.toLowerCase();
    s.filteredSites = this.sites.filter(
      (site) => site.SiteId.toLowerCase().includes(lower) || (site.SiteName ?? '').toLowerCase().includes(lower)
    );
  }

  selectSite(side: Side, site: Site) {
    const s = this.sideOf(side);
    const changedSite = s.siteId !== site.SiteId;
    s.siteId = site.SiteId;
    s.siteName = site.SiteName;
    s.showSitePicker = false;

    // A warehouse picked under a different site may no longer belong to this one.
    if (changedSite && s.warehouseId) {
      const stillValid = this.allWarehouses.some(
        (w) => w.WarehouseId === s.warehouseId && (!w.OperationalSiteId || w.OperationalSiteId === site.SiteId)
      );
      if (!stillValid) {
        s.warehouseId = '';
        s.warehouseName = '';
        this.clearLocation(side);
      }
    }
    this.onWarehouseSearch(side, '');
  }

  // ── Warehouse picker (cascades to the selected site, falls back to all) ─────
  toggleWarehousePicker(side: Side) {
    const s = this.sideOf(side);
    s.showSitePicker = false;
    s.showLocationPicker = false;
    s.showWarehousePicker = !s.showWarehousePicker;
    this.onWarehouseSearch(side, '');
  }

  private warehouseCandidates(side: Side): Warehouse[] {
    const s = this.sideOf(side);
    if (!s.siteId) return this.allWarehouses;
    const forSite = this.allWarehouses.filter((w) => w.OperationalSiteId === s.siteId);
    return forSite.length > 0 ? forSite : this.allWarehouses;
  }

  onWarehouseSearch(side: Side, term: string) {
    const s = this.sideOf(side);
    const lower = term.toLowerCase();
    s.filteredWarehouses = this.warehouseCandidates(side).filter(
      (w) => w.WarehouseId.toLowerCase().includes(lower) || (w.WarehouseName ?? '').toLowerCase().includes(lower)
    );
  }

  selectWarehouse(side: Side, wh: Warehouse) {
    const s = this.sideOf(side);
    const changedWarehouse = s.warehouseId !== wh.WarehouseId;
    s.warehouseId = wh.WarehouseId;
    s.warehouseName = wh.WarehouseName;
    s.showWarehousePicker = false;
    if (changedWarehouse) {
      this.clearLocation(side);
    }
  }

  // ── Location picker (disabled until a warehouse is chosen for that side) ────
  toggleLocationPicker(side: Side) {
    const s = this.sideOf(side);
    if (!s.warehouseId) return;
    s.showSitePicker = false;
    s.showWarehousePicker = false;
    s.showLocationPicker = !s.showLocationPicker;
    if (s.showLocationPicker) {
      this.loadLocations(side);
    }
  }

  private loadLocations(side: Side) {
    const s = this.sideOf(side);
    const cached = this.locationsCache.get(s.warehouseId);
    if (cached) {
      s.filteredLocations = cached;
      return;
    }
    s.isLoadingLocations = true;
    this.transferJournalService.getLocations(s.warehouseId).subscribe({
      next: (locations) => {
        this.locationsCache.set(s.warehouseId, locations);
        s.filteredLocations = locations;
        s.isLoadingLocations = false;
      },
      error: async () => {
        s.isLoadingLocations = false;
        s.filteredLocations = [];
        await this.showToast('Could not load locations for this warehouse.');
      },
    });
  }

  onLocationSearch(side: Side, term: string) {
    const s = this.sideOf(side);
    const cached = this.locationsCache.get(s.warehouseId) ?? [];
    const lower = term.toLowerCase();
    s.filteredLocations = cached.filter((l) => l.LocationId.toLowerCase().includes(lower));
  }

  selectLocation(side: Side, loc: WarehouseLocation) {
    const s = this.sideOf(side);
    s.locationId = loc.LocationId;
    s.showLocationPicker = false;
  }

  private clearLocation(side: Side) {
    const s = this.sideOf(side);
    s.locationId = '';
    s.filteredLocations = [];
  }

  fieldInvalid(value: string): boolean {
    if (!this.submitted) return false;
    return !value.trim();
  }

  get sameFromTo(): boolean {
    return (
      !!this.from.siteId &&
      this.from.siteId === this.to.siteId &&
      this.from.warehouseId === this.to.warehouseId &&
      this.from.locationId === this.to.locationId
    );
  }

  get isValid(): boolean {
    const filled =
      !!this.from.siteId.trim() && !!this.from.warehouseId.trim() && !!this.from.locationId.trim() &&
      !!this.to.siteId.trim() && !!this.to.warehouseId.trim() && !!this.to.locationId.trim();
    return filled && !this.sameFromTo;
  }

  async startScanning() {
    this.submitted = true;
    if (!this.isValid) {
      if (this.sameFromTo) {
        await this.showToast('From and To locations must be different.');
      }
      return;
    }

    this.router.navigate(['/inventory/transfer-journal/scan', this.soNumber], {
      state: {
        fromSiteId: this.from.siteId,
        fromSiteName: this.from.siteName,
        fromWarehouseId: this.from.warehouseId,
        fromWarehouseName: this.from.warehouseName,
        fromLocationId: this.from.locationId,
        toSiteId: this.to.siteId,
        toSiteName: this.to.siteName,
        toWarehouseId: this.to.warehouseId,
        toWarehouseName: this.to.warehouseName,
        toLocationId: this.to.locationId,
      },
    });
  }

  changeSo() {
    this.router.navigate(['/inventory/transfer-journal']);
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      buttons: [{ text: 'Dismiss', role: 'cancel' }],
      color: 'danger',
      position: 'bottom',
    });
    await toast.present();
  }
}

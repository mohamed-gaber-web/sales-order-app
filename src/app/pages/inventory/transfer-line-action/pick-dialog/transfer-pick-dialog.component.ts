import { Component, DestroyRef, Input, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular';
import { TransferShipmentService } from '../../../../core/services/transfer-shipment.service';
import { D365WmsLocation } from '../../../../models/inventory.model';

/** A line the dialog asks about, with the quantity it starts at. */
export interface TransferPickLine {
  lineNum: number;
  itemNumber: string;
  unitId?: string;
  qty: number;
}

/** What the operator confirmed for one line; a dimension is '' when none was chosen. */
export interface TransferPickResult {
  lineNum: number;
  qty: number;
  /** The shipping warehouse's site. */
  inventSiteId: string;
  /** The warehouse: the chosen location's, else the shipping warehouse. */
  inventLocationId: string;
  wmsLocationId: string;
  inventBatchId: string;
  inventSerialId: string;
  licensePlateId: string;
}

interface PickEntry {
  line: TransferPickLine;
  /** Bound to ion-input, which hands back a string; read it through qtyOf(). */
  qty: number | string;
  location: D365WmsLocation | null;
  batchId: string;
  serialId: string;
  licensePlateId: string;
}

// An empty box counts as 0, i.e. skip the line.
function qtyOf(entry: PickEntry): number {
  return entry.qty === '' ? 0 : Number(entry.qty);
}

/**
 * Asks what transferLinePick needs beyond a quantity. Dismisses with role
 * 'confirm' and the lines to pick (quantity above 0), or role 'cancel'.
 */
@Component({
  selector: 'app-transfer-pick-dialog',
  templateUrl: './transfer-pick-dialog.component.html',
  styleUrls: ['./transfer-pick-dialog.component.scss'],
  standalone: false,
})
export class TransferPickDialogComponent implements OnInit {
  private modalCtrl = inject(ModalController);
  private transferShipmentService = inject(TransferShipmentService);
  private destroyRef = inject(DestroyRef);

  @Input() lines: TransferPickLine[] = [];
  /** The shipping warehouse; narrows the location list to it. */
  @Input() warehouseId?: string;

  entries: PickEntry[] = [];
  siteId = '';
  isLoadingSite = false;
  locations: D365WmsLocation[] = [];
  isLoadingLocations = false;
  locationsError = false;
  /** Batches per item number; an item is absent until its batches arrive. */
  batchesByItem: Partial<Record<string, string[]>> = {};
  loadingBatchItems = new Set<string>();
  batchErrorItems = new Set<string>();
  /** Serial numbers per item number; an item is absent until its serials arrive. */
  serialsByItem: Partial<Record<string, string[]>> = {};
  loadingSerialItems = new Set<string>();
  serialErrorItems = new Set<string>();
  licensePlates: string[] = [];
  isLoadingPlates = false;
  platesError = false;

  ngOnInit() {
    this.entries = this.lines.map(line => ({ line, qty: line.qty, location: null, batchId: '', serialId: '', licensePlateId: '' }));
    this.loadSite();
    this.loadLocations();
    new Set(this.lines.map(l => l.itemNumber)).forEach(item => {
      this.loadBatches(item);
      this.loadSerials(item);
    });
    this.loadLicensePlates();
  }

  loadBatches(itemNumber: string) {
    this.loadingBatchItems.add(itemNumber);
    this.batchErrorItems.delete(itemNumber);
    this.transferShipmentService.getItemBatches(itemNumber).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: batches => {
        this.batchesByItem[itemNumber] = batches.map(b => b.BatchNumber).filter(Boolean);
        this.loadingBatchItems.delete(itemNumber);
      },
      error: () => {
        this.loadingBatchItems.delete(itemNumber);
        this.batchErrorItems.add(itemNumber);
      },
    });
  }

  // Pick waits for the site so it is never sent empty by a fast tap; if the
  // lookup fails the site stays '' and D365 resolves it from the warehouse.
  loadSite() {
    if (!this.warehouseId) return;
    this.isLoadingSite = true;
    this.transferShipmentService.getWarehouseSiteId(this.warehouseId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: siteId => {
        this.siteId = siteId;
        this.isLoadingSite = false;
      },
      error: () => {
        this.isLoadingSite = false;
      },
    });
  }

  loadSerials(itemNumber: string) {
    this.loadingSerialItems.add(itemNumber);
    this.serialErrorItems.delete(itemNumber);
    this.transferShipmentService.getItemSerialNumbers(itemNumber).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: serials => {
        this.serialsByItem[itemNumber] = serials.map(s => s.SerialNumber).filter(Boolean);
        this.loadingSerialItems.delete(itemNumber);
      },
      error: () => {
        this.loadingSerialItems.delete(itemNumber);
        this.serialErrorItems.add(itemNumber);
      },
    });
  }

  loadLocations() {
    this.isLoadingLocations = true;
    this.locationsError = false;
    this.transferShipmentService.getWmsLocations(this.warehouseId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: locations => {
        this.locations = locations.filter(l => l.wMSLocationId);
        this.isLoadingLocations = false;
      },
      error: () => {
        this.isLoadingLocations = false;
        this.locationsError = true;
      },
    });
  }

  loadLicensePlates() {
    this.isLoadingPlates = true;
    this.platesError = false;
    this.transferShipmentService.getLicensePlates().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: plates => {
        this.licensePlates = plates.map(p => p.LicensePlateNumber).filter(Boolean);
        this.isLoadingPlates = false;
      },
      error: () => {
        this.isLoadingPlates = false;
        this.platesError = true;
      },
    });
  }

  // A location id is only unique within its warehouse.
  sameLocation = (a: D365WmsLocation | null, b: D365WmsLocation | null): boolean =>
    a?.inventLocationId === b?.inventLocationId && a?.wMSLocationId === b?.wMSLocationId;

  isQtyValid(entry: PickEntry): boolean {
    const qty = qtyOf(entry);
    return !Number.isNaN(qty) && qty >= 0;
  }

  // A serial number is one unit, and can't be picked on two lines of the same item.
  isSerialValid(entry: PickEntry): boolean {
    if (!entry.serialId) return true;
    return qtyOf(entry) <= 1 && !this.entries.some(e =>
      e !== entry && e.serialId === entry.serialId && e.line.itemNumber === entry.line.itemNumber);
  }

  // An item that has serial numbers can't be picked without one. A skipped line needs none.
  isSerialMissing(entry: PickEntry): boolean {
    return qtyOf(entry) > 0 && !entry.serialId && (this.serialsByItem[entry.line.itemNumber]?.length ?? 0) > 0;
  }

  get isFormValid(): boolean {
    return this.entries.every(e => this.isQtyValid(e) && this.isSerialValid(e) && !this.isSerialMissing(e))
      && this.entries.some(e => qtyOf(e) > 0);
  }

  /** Pick waits for the site and for every item's serials, so a required serial can't be skipped by a fast tap. */
  get isLoadingRequired(): boolean {
    return this.isLoadingSite || this.loadingSerialItems.size > 0;
  }

  confirm() {
    if (!this.isFormValid || this.isLoadingRequired) return;
    const results: TransferPickResult[] = this.entries
      .filter(e => qtyOf(e) > 0)
      .map(e => ({
        lineNum: e.line.lineNum,
        qty: qtyOf(e),
        inventSiteId: this.siteId,
        inventLocationId: e.location?.inventLocationId || this.warehouseId || '',
        wmsLocationId: e.location?.wMSLocationId ?? '',
        inventBatchId: e.batchId,
        inventSerialId: e.serialId,
        licensePlateId: e.licensePlateId,
      }));
    this.modalCtrl.dismiss(results, 'confirm');
  }

  dismiss() {
    this.modalCtrl.dismiss(null, 'cancel');
  }
}

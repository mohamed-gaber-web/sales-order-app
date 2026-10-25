import { Component, DestroyRef, Input, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { TransferShipmentService } from '../../../../core/services/transfer-shipment.service';
import { D365WmsLocation, TransferLineAction } from '../../../../models/inventory.model';
import { TRANSFER_LINE_ACTIONS } from '../transfer-line-action.config';
import { OptionPickerComponent, PickerOption } from './option-picker.component';

/** A line the dialog asks about, with the quantity it starts at. */
export interface TransferLineInput {
  lineNum: number;
  itemNumber: string;
  unitId?: string;
  qty: number;
  /** What is left on this action's side; offered as "Max". */
  remainQty?: number;
}

/** What the operator confirmed for one line; a dimension is '' when none was chosen. */
export interface TransferLineResult {
  lineNum: number;
  qty: number;
  /** The site of this action's warehouse. */
  inventSiteId: string;
  /** The warehouse: the chosen location's, else this action's warehouse. */
  inventLocationId: string;
  wmsLocationId: string;
  inventBatchId: string;
  inventSerialId: string;
  licensePlateId: string;
}

interface LineEntry {
  line: TransferLineInput;
  /** Bound to an <input>, which can hand back a string; read it through qtyOf(). */
  qty: number | string;
  location: D365WmsLocation | null;
  batchId: string;
  serialId: string;
  licensePlateId: string;
}

/** Where a lookup-backed field is, for the template. */
export type FieldState = 'loading' | 'error' | 'empty' | 'ready';

type DimKind = 'location' | 'batch' | 'serial' | 'plate';

interface DimField {
  kind: DimKind;
  labelKey: string;
  value: string;
  state: FieldState;
  /** Shown when the lookup came back with nothing to choose. */
  emptyKey: string;
}

// An empty box counts as 0, i.e. skip the line.
function qtyOf(entry: LineEntry): number {
  return entry.qty === '' || entry.qty === null ? 0 : Number(entry.qty);
}

// Rounds away float drift from repeated +/- on decimal quantities.
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Asks what transferLineReservation / transferLinePick / transferLineRegistration
 * need for each line: a quantity, and where the stock is (location, batch,
 * serial number, license plate). Dismisses with role 'confirm' and the lines to
 * send (quantity above 0), or role 'cancel'.
 */
@Component({
  selector: 'app-transfer-line-dialog',
  templateUrl: './transfer-line-dialog.component.html',
  styleUrls: ['./transfer-line-dialog.component.scss'],
  standalone: false,
})
export class TransferLineDialogComponent implements OnInit {
  private modalCtrl = inject(ModalController);
  private translate = inject(TranslateService);
  private transferShipmentService = inject(TransferShipmentService);
  private destroyRef = inject(DestroyRef);

  @Input() action: TransferLineAction = 'pick';
  @Input() orderNumber = '';
  @Input() lines: TransferLineInput[] = [];
  /** This action's warehouse (shipping, or receiving for registration); narrows the location list to it. */
  @Input() warehouseId?: string;

  readonly qtyOf = qtyOf;
  readonly dimKinds: DimKind[] = ['location', 'plate', 'batch', 'serial'];

  entries: LineEntry[] = [];
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

  get actionLabel(): string {
    return this.translate.instant(`transferLine.${this.action}.label`);
  }

  get actionIcon(): string {
    return TRANSFER_LINE_ACTIONS[this.action].icon;
  }

  get activeCount(): number {
    return this.entries.filter(e => qtyOf(e) > 0).length;
  }

  ngOnInit() {
    this.entries = this.lines.map(line => ({
      line, qty: line.qty, location: null, batchId: '', serialId: '', licensePlateId: '',
    }));
    this.loadSite();
    this.loadLocations();
    new Set(this.lines.map(l => l.itemNumber)).forEach(item => {
      this.loadBatches(item);
      this.loadSerials(item);
    });
    this.loadLicensePlates();
  }

  // ── Lookups ───────────────────────────────────────────────────────────────

  // The action waits for the site so it is never sent empty by a fast tap; if
  // the lookup fails the site stays '' and D365 resolves it from the warehouse.
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

  // ── Field states ──────────────────────────────────────────────────────────

  get locationState(): FieldState {
    if (this.isLoadingLocations) return 'loading';
    if (this.locationsError) return 'error';
    return this.locations.length ? 'ready' : 'empty';
  }

  get plateState(): FieldState {
    if (this.isLoadingPlates) return 'loading';
    if (this.platesError) return 'error';
    return this.licensePlates.length ? 'ready' : 'empty';
  }

  batchState(entry: LineEntry): FieldState {
    const item = entry.line.itemNumber;
    if (this.loadingBatchItems.has(item)) return 'loading';
    if (this.batchErrorItems.has(item)) return 'error';
    return this.batchesByItem[item]?.length ? 'ready' : 'empty';
  }

  serialState(entry: LineEntry): FieldState {
    const item = entry.line.itemNumber;
    if (this.loadingSerialItems.has(item)) return 'loading';
    if (this.serialErrorItems.has(item)) return 'error';
    return this.serialsByItem[item]?.length ? 'ready' : 'empty';
  }

  // ── Quantity ──────────────────────────────────────────────────────────────

  step(entry: LineEntry, delta: number) {
    const current = Number.isNaN(qtyOf(entry)) ? 0 : qtyOf(entry);
    entry.qty = Math.max(0, round(current + delta));
  }

  setMax(entry: LineEntry) {
    entry.qty = entry.line.remainQty ?? entry.line.qty;
  }

  // ── Choosing ──────────────────────────────────────────────────────────────

  async chooseLocation(entry: LineEntry) {
    if (this.locationState === 'error') return this.loadLocations();
    const options: PickerOption[] = this.locations.map((l, i) => ({
      value: String(i),
      label: l.wMSLocationId,
      // Only needed when the list spans warehouses; a location id is unique within one.
      detail: this.warehouseId ? undefined : l.inventLocationId,
    }));
    const selected = entry.location ? String(this.locations.indexOf(entry.location)) : '';
    const value = await this.openPicker('transferLine.location', options, selected);
    if (value !== undefined) entry.location = value === '' ? null : this.locations[Number(value)];
  }

  async chooseBatch(entry: LineEntry) {
    if (this.batchState(entry) === 'error') return this.loadBatches(entry.line.itemNumber);
    const batches = this.batchesByItem[entry.line.itemNumber] ?? [];
    const value = await this.openPicker('transferLine.batch', batches.map(b => ({ value: b, label: b })), entry.batchId);
    if (value !== undefined) entry.batchId = value;
  }

  async chooseSerial(entry: LineEntry) {
    if (this.serialState(entry) === 'error') return this.loadSerials(entry.line.itemNumber);
    const serials = this.serialsByItem[entry.line.itemNumber] ?? [];
    const value = await this.openPicker('transferLine.serial', serials.map(s => ({ value: s, label: s })), entry.serialId);
    if (value === undefined) return;
    entry.serialId = value;
    // A serial number is one unit.
    if (value && qtyOf(entry) > 1) entry.qty = 1;
  }

  async choosePlate(entry: LineEntry) {
    if (this.plateState === 'error') return this.loadLicensePlates();
    const value = await this.openPicker(
      'transferLine.licensePlate',
      this.licensePlates.map(p => ({ value: p, label: p })),
      entry.licensePlateId,
    );
    if (value !== undefined) entry.licensePlateId = value;
  }

  /** One dimension field of a line, as the template draws it. */
  dim(kind: DimKind, entry: LineEntry): DimField {
    switch (kind) {
      case 'location':
        return { kind, labelKey: 'transferLine.location', value: entry.location?.wMSLocationId ?? '', state: this.locationState, emptyKey: 'transferLine.noLocations' };
      case 'batch':
        return { kind, labelKey: 'transferLine.batch', value: entry.batchId, state: this.batchState(entry), emptyKey: 'transferLine.noBatches' };
      case 'serial':
        return { kind, labelKey: 'transferLine.serial', value: entry.serialId, state: this.serialState(entry), emptyKey: 'transferLine.noSerials' };
      case 'plate':
        return { kind, labelKey: 'transferLine.licensePlate', value: entry.licensePlateId, state: this.plateState, emptyKey: 'transferLine.noLicensePlates' };
    }
  }

  choose(kind: DimKind, entry: LineEntry) {
    switch (kind) {
      case 'location': return this.chooseLocation(entry);
      case 'batch': return this.chooseBatch(entry);
      case 'serial': return this.chooseSerial(entry);
      case 'plate': return this.choosePlate(entry);
    }
  }

  /** Copies this line's location to every line. */
  useLocationForAll(entry: LineEntry) {
    this.entries.forEach(e => (e.location = entry.location));
  }

  /** Copies this line's license plate to every line. */
  usePlateForAll(entry: LineEntry) {
    this.entries.forEach(e => (e.licensePlateId = entry.licensePlateId));
  }

  private async openPicker(titleKey: string, options: PickerOption[], selected: string): Promise<string | undefined> {
    const modal = await this.modalCtrl.create({
      component: OptionPickerComponent,
      componentProps: {
        title: this.translate.instant(titleKey),
        options,
        selected,
        noneLabel: this.translate.instant('transferLine.notSet'),
      },
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
      handle: true,
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<string>();
    return role === 'select' ? (data ?? '') : undefined;
  }

  // ── Validation ────────────────────────────────────────────────────────────

  isQtyValid(entry: LineEntry): boolean {
    const qty = qtyOf(entry);
    return !Number.isNaN(qty) && qty >= 0;
  }

  // A serial number is one unit, and can't be used on two lines of the same item.
  isSerialValid(entry: LineEntry): boolean {
    if (!entry.serialId) return true;
    return qtyOf(entry) <= 1 && !this.entries.some(e =>
      e !== entry && e.serialId === entry.serialId && e.line.itemNumber === entry.line.itemNumber);
  }

  // An item that has serial numbers can't go without one. A skipped line needs none.
  isSerialMissing(entry: LineEntry): boolean {
    return qtyOf(entry) > 0 && !entry.serialId && (this.serialsByItem[entry.line.itemNumber]?.length ?? 0) > 0;
  }

  get isFormValid(): boolean {
    return this.entries.every(e => this.isQtyValid(e) && this.isSerialValid(e) && !this.isSerialMissing(e))
      && this.activeCount > 0;
  }

  /** The action waits for the site and every item's serials, so a required serial can't be skipped by a fast tap. */
  get isLoadingRequired(): boolean {
    return this.isLoadingSite || this.loadingSerialItems.size > 0;
  }

  confirm() {
    if (!this.isFormValid || this.isLoadingRequired) return;
    const results: TransferLineResult[] = this.entries
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

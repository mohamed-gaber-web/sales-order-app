import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActionSheetController, AlertController, LoadingController, ToastController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { InventoryService } from '../../../core/services/inventory.service';
import { Warehouse, WarehouseLocation } from '../../../models/inventory.model';

@Component({
  selector: 'app-location-mgmt',
  templateUrl: './location-mgmt.page.html',
  styleUrls: ['./location-mgmt.page.scss'],
  standalone: false,
})
export class LocationMgmtPage implements OnInit {
  // Warehouse picker
  warehouses: Warehouse[] = [];
  selectedWarehouse: Warehouse | null = null;

  // Location list
  locations: WarehouseLocation[] = [];
  totalCount = 0;
  isLoading = false;
  isLoadingMore = false;
  private skip = 0;

  // Search
  searchTerm = '';
  private search$ = new Subject<string>();

  // Create location form
  showCreateForm = false;
  createForm = new FormGroup({
    locationId: new FormControl('', [Validators.required, Validators.maxLength(20)]),
    locationProfileId: new FormControl('', Validators.required),
    locationType: new FormControl('Picking'),
  });

  locationTypes = ['Picking', 'Packing', 'Bulk', 'Inbound', 'Outbound', 'Stage'];

  constructor(
    private inventorySvc: InventoryService,
    private actionSheetCtrl: ActionSheetController,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
  ) {}

  ngOnInit() {
    this.inventorySvc.getWarehouses().subscribe(res => {
      this.warehouses = res.value ?? [];
    });

    this.search$
      .pipe(debounceTime(350), distinctUntilChanged())
      .subscribe(term => {
        this.searchTerm = term;
        this.resetAndLoad();
      });
  }

  onWarehouseChange(event: CustomEvent) {
    const wid = event.detail.value as string;
    this.selectedWarehouse = this.warehouses.find(w => w.WarehouseId === wid) ?? null;
    this.showCreateForm = false;
    this.resetAndLoad();
  }

  onSearchInput(event: CustomEvent) {
    this.search$.next((event.detail.value as string) ?? '');
  }

  private resetAndLoad() {
    this.skip = 0;
    this.locations = [];
    this.totalCount = 0;
    if (this.selectedWarehouse) this.loadLocations();
  }

  private loadLocations() {
    if (!this.selectedWarehouse) return;
    this.isLoading = true;
    this.inventorySvc
      .getLocations(this.selectedWarehouse.WarehouseId, this.skip, this.searchTerm || undefined)
      .subscribe({
        next: res => {
          this.locations = [...this.locations, ...(res.value ?? [])];
          this.totalCount = res['@odata.count'] ?? this.locations.length;
          this.skip = this.locations.length;
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
          this.showToast('Failed to load locations', 'danger');
        },
      });
  }

  loadMore(event: CustomEvent) {
    if (!this.selectedWarehouse || this.locations.length >= this.totalCount) {
      (event.target as HTMLIonInfiniteScrollElement).complete();
      return;
    }
    this.isLoadingMore = true;
    this.inventorySvc
      .getLocations(this.selectedWarehouse.WarehouseId, this.skip, this.searchTerm || undefined)
      .subscribe({
        next: res => {
          this.locations = [...this.locations, ...(res.value ?? [])];
          this.skip = this.locations.length;
          this.isLoadingMore = false;
          (event.target as HTMLIonInfiniteScrollElement).complete();
        },
        error: () => {
          this.isLoadingMore = false;
          (event.target as HTMLIonInfiniteScrollElement).complete();
        },
      });
  }

  get hasMore(): boolean {
    return this.locations.length < this.totalCount;
  }

  async openActions(loc: WarehouseLocation) {
    const sheet = await this.actionSheetCtrl.create({
      header: loc.LocationId,
      buttons: [
        {
          text: loc.IsBlocked ? 'Unblock Location' : 'Block Location',
          icon: loc.IsBlocked ? 'lock-open-outline' : 'lock-closed-outline',
          role: loc.IsBlocked ? undefined : 'destructive',
          handler: () => this.toggleBlock(loc),
        },
        { text: 'Cancel', role: 'cancel', icon: 'close-outline' },
      ],
    });
    await sheet.present();
  }

  private async toggleBlock(loc: WarehouseLocation) {
    const action = loc.IsBlocked ? 'Unblock' : 'Block';
    const alert = await this.alertCtrl.create({
      header: `${action} Location`,
      message: `${action} <strong>${loc.LocationId}</strong> in warehouse <strong>${loc.WarehouseId}</strong>?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: action,
          role: loc.IsBlocked ? undefined : 'destructive',
          handler: () => this.doToggleBlock(loc),
        },
      ],
    });
    await alert.present();
  }

  private async doToggleBlock(loc: WarehouseLocation) {
    const loading = await this.loadingCtrl.create({ message: 'Updating…' });
    await loading.present();
    const call$ = loc.IsBlocked
      ? this.inventorySvc.unblockLocation(loc.WarehouseId, loc.LocationId, loc.dataAreaId)
      : this.inventorySvc.blockLocation(loc.WarehouseId, loc.LocationId, loc.dataAreaId);
    call$.subscribe({
      next: () => {
        loc.IsBlocked = !loc.IsBlocked;
        loading.dismiss();
        this.showToast(`Location ${loc.IsBlocked ? 'blocked' : 'unblocked'} successfully`);
      },
      error: () => {
        loading.dismiss();
        this.showToast('Update failed. Please try again.', 'danger');
      },
    });
  }

  toggleCreateForm() {
    this.showCreateForm = !this.showCreateForm;
    if (!this.showCreateForm) this.createForm.reset({ locationType: 'Picking' });
  }

  async submitCreate() {
    if (this.createForm.invalid || !this.selectedWarehouse) return;
    const loading = await this.loadingCtrl.create({ message: 'Creating location…' });
    await loading.present();
    const { locationId, locationProfileId, locationType } = this.createForm.value;
    const payload: Partial<WarehouseLocation> = {
      WarehouseId: this.selectedWarehouse.WarehouseId,
      LocationId: locationId ?? '',
      LocationProfileId: locationProfileId ?? '',
      LocationType: locationType ?? 'Picking',
      IsBlocked: false,
      dataAreaId: this.selectedWarehouse.dataAreaId ?? 'usmf',
    };
    this.inventorySvc.createLocation(payload).subscribe({
      next: () => {
        loading.dismiss();
        this.showToast('Location created successfully');
        this.createForm.reset({ locationType: 'Picking' });
        this.showCreateForm = false;
        this.resetAndLoad();
      },
      error: () => {
        loading.dismiss();
        this.showToast('Failed to create location. Check your inputs.', 'danger');
      },
    });
  }

  private async showToast(message: string, color = 'success') {
    const toast = await this.toastCtrl.create({ message, color, buttons: [{ text: 'Dismiss', role: 'cancel' }], position: 'bottom' });
    toast.present();
  }

  trackByLocation(_: number, loc: WarehouseLocation) {
    return loc.LocationId;
  }
}

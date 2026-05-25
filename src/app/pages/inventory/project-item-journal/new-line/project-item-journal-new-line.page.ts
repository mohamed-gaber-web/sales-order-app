import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ModalController, ToastController } from '@ionic/angular';
import {
  ProjectItemJournalService,
  PIJJournalTrans,
  PIJProject,
  PIJLineProperty,
  PIJCategory,
} from '../../../../core/services/project-item-journal.service';
import { ProjectPickerModalComponent } from './project-picker-modal.component';

@Component({
  selector: 'app-pij-new-line',
  templateUrl: './project-item-journal-new-line.page.html',
  styleUrls: ['./project-item-journal-new-line.page.scss'],
  standalone: false,
})
export class ProjectItemJournalNewLinePage {
  journalId = '';
  journalName = '';

  // Form fields
  projectId = '';
  projectDisplayName = '';
  activityNumber = '';
  itemId = '';
  quantity = 1;
  categoryId = '';
  linePropertyId = '';
  currencyId = 'USD';
  projectDate = this.todayStr();
  siteId = '';
  warehouseId = '';

  // Advanced
  showAdvanced = false;
  configId = '';
  sizeId = '';
  colorId = '';
  styleId = '';
  versionId = '';
  serialId = '';

  // Lookups
  categories: PIJCategory[] = [];
  lineProperties: PIJLineProperty[] = [];
  lookupsLoading = false;
  lookupsError = false;

  // Submit state
  isSaving = false;
  submitted = false;

  get maxDate(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.dateStr(tomorrow);
  }

  constructor(
    private router: Router,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private service: ProjectItemJournalService,
  ) {}

  ionViewWillEnter() {
    const nav = this.router.getCurrentNavigation();
    const state = nav?.extras?.state ?? history.state;
    this.journalId = state?.['journalId'] ?? '';
    this.journalName = state?.['journalName'] ?? '';
    this.siteId = this.service.getLastUsedSite();
    this.warehouseId = this.service.getLastUsedWarehouse();
    this.loadLookups();
  }

  private loadLookups() {
    this.lookupsLoading = true;
    this.lookupsError = false;
    let catDone = false;
    let lpDone = false;

    const onBothDone = () => {
      this.lookupsLoading = false;
      this.applyDefaults();
    };

    this.service.getCategories().subscribe({
      next: (res: any) => {
        this.categories = res.value ?? [];
        catDone = true;
        if (lpDone) onBothDone();
      },
      error: () => {
        this.lookupsError = true;
        catDone = true;
        if (lpDone) onBothDone();
      }
    });

    this.service.getLineProperties().subscribe({
      next: (res: any) => {
        this.lineProperties = res.value ?? [];
        lpDone = true;
        if (catDone) onBothDone();
      },
      error: () => {
        this.lookupsError = true;
        lpDone = true;
        if (catDone) onBothDone();
      }
    });
  }

  private applyDefaults() {
    if (!this.categoryId) {
      const pref = this.categories.find(c => c.Category === 'ProjItem');
      this.categoryId = pref?.Category ?? this.categories[0]?.Category ?? '';
    }
    if (!this.linePropertyId) {
      const pref = this.lineProperties.find(lp => lp.LinePropertyId === 'Billable');
      this.linePropertyId = pref?.LinePropertyId ?? this.lineProperties[0]?.LinePropertyId ?? '';
    }
  }

  async openProjectPicker() {
    const modal = await this.modalCtrl.create({
      component: ProjectPickerModalComponent,
      breakpoints: [0, 0.92, 1],
      initialBreakpoint: 0.92,
      handle: true,
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<PIJProject>();
    if (role === 'selected' && data) {
      this.projectId = data.ProjectID;
      this.projectDisplayName = data.Name && data.Name !== data.ProjectID ? data.Name : '';
    }
  }

  incrementQty() {
    this.quantity = Math.round((this.quantity + 1) * 10000) / 10000;
  }

  decrementQty() {
    if (this.quantity > 1) {
      this.quantity = Math.round((this.quantity - 1) * 10000) / 10000;
    }
  }

  isValid(): boolean {
    return !!(
      this.journalId &&
      this.projectId.trim() &&
      this.itemId.trim() &&
      this.quantity > 0 &&
      this.categoryId &&
      this.linePropertyId &&
      this.currencyId.trim() &&
      this.projectDate &&
      this.siteId.trim() &&
      this.warehouseId.trim()
    );
  }

  async save() {
    this.submitted = true;
    if (!this.isValid() || this.isSaving) return;
    this.isSaving = true;

    const body: Partial<PIJJournalTrans> = {
      dataAreaId: 'usmf',
      JournalId: this.journalId,
      ProjectId: this.projectId.trim(),
      ItemId: this.itemId.trim(),
      Quantity: this.quantity,
      PriceUnit: 1,
      ProjectCategoryId: this.categoryId,
      ProjectLinePropertyId: this.linePropertyId,
      ProjectSalesCurrencyId: this.currencyId.trim().toUpperCase(),
      ProjectDate: `${this.projectDate}T12:00:00Z`,
      StorageSiteId: this.siteId.trim(),
      StorageWarehouseId: this.warehouseId.trim(),
      ActivityNumber: this.activityNumber.trim(),
      ProductConfigurationId: this.configId || '',
      ProductSizeId: this.sizeId || '',
      ProductColorId: this.colorId || '',
      ProductStyleId: this.styleId || '',
      ProductVersionId: this.versionId || '',
      inventSerialId: this.serialId || '',
    };

    this.service.createLine(body).subscribe({
      next: async () => {
        this.isSaving = false;
        this.service.saveLastUsed(this.siteId.trim(), this.warehouseId.trim());
        const t = await this.toastCtrl.create({
          message: 'Line added successfully.',
          duration: 2000,
          color: 'success',
          position: 'bottom',
        });
        await t.present();
        this.router.navigate(
          ['/inventory/project-item-journal/lines', this.journalId],
          { state: { journalName: this.journalName } }
        );
      },
      error: async (err) => {
        this.isSaving = false;
        const serverMsg = this.extractErrorMessage(err);
        const t = await this.toastCtrl.create({
          message: serverMsg || 'Failed to add line. Please try again.',
          duration: 5000,
          color: 'danger',
          position: 'bottom',
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
        });
        await t.present();
      }
    });
  }

  cancel() {
    this.router.navigate(
      ['/inventory/project-item-journal/lines', this.journalId],
      { state: { journalName: this.journalName } }
    );
  }

  fieldInvalid(value: string | number | null | undefined): boolean {
    if (!this.submitted) return false;
    return !value || value === 0;
  }

  private extractErrorMessage(err: any): string {
    return err?.error?.error?.message ?? err?.error?.message ?? err?.message ?? '';
  }

  private todayStr(): string {
    return this.dateStr(new Date());
  }

  private dateStr(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
}

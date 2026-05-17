import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { InventoryService } from '../../../core/services/inventory.service';
import { Warehouse } from '../../../models/inventory.model';

@Component({
  selector: 'app-inquiry',
  templateUrl: './inquiry.page.html',
  styleUrls: ['./inquiry.page.scss'],
  standalone: false,
})
export class InquiryPage {
  warehouses: Warehouse[] = [];
  filtered: Warehouse[] = [];
  searchTerm = '';
  isLoading = false;

  constructor(
    private invService: InventoryService,
    private toastCtrl: ToastController,
    private router: Router,
  ) {}

  ionViewWillEnter() {
    if (this.warehouses.length === 0) this.loadWarehouses();
  }

  loadWarehouses() {
    this.isLoading = true;
    this.invService.getWarehouses().subscribe({
      next: (res) => {
        this.warehouses = res.value ?? [];
        this.applyFilter();
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        const t = await this.toastCtrl.create({
          message: 'Could not load warehouses.',
          duration: 3000, color: 'danger', position: 'bottom',
        });
        await t.present();
      }
    });
  }

  onSearchChange() {
    this.applyFilter();
  }

  private applyFilter() {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      this.filtered = [...this.warehouses];
      return;
    }
    this.filtered = this.warehouses.filter(w =>
      w.WarehouseId.toLowerCase().includes(term) ||
      (w.WarehouseName ?? '').toLowerCase().includes(term)
    );
  }

  selectWarehouse(wh: Warehouse) {
    this.router.navigate(['/inventory/inquiry/items', wh.WarehouseId]);
  }

  doRefresh(event: CustomEvent) {
    this.warehouses = [];
    this.filtered = [];
    this.loadWarehouses();
    setTimeout(() => (event.target as HTMLIonRefresherElement).complete(), 1200);
  }
}

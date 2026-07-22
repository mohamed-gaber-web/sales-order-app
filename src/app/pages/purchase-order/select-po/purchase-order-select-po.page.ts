import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ModalController, ToastController } from '@ionic/angular';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { PurchaseOrderHeader } from '../../../models/purchase-order.model';
import { ScannerModalComponent } from '../../inventory/scanner/scanner-modal.component';

@Component({
  selector: 'app-purchase-order-select-po',
  templateUrl: './purchase-order-select-po.page.html',
  styleUrls: ['./purchase-order-select-po.page.scss'],
  standalone: false,
})
export class PurchaseOrderSelectPoPage {
  searchTerm = '';
  showDropdown = false;
  isSearching = false;
  matches: PurchaseOrderHeader[] = [];

  private allOrders: PurchaseOrderHeader[] = [];
  private ordersLoaded = false;
  private searchSeq = 0;

  private router = inject(Router);
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private poService = inject(PurchaseOrderService);

  vendorOf(po: PurchaseOrderHeader): string {
    return (po.OrderVendorAccountNumber ?? po.VendorAccountNumber ?? '') as string;
  }

  // ── PO search (live autocomplete on the search field) ──────
  onSearchInput(term: string) {
    this.searchTerm = term;
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      this.matches = [];
      this.showDropdown = false;
      this.isSearching = false;
      return;
    }
    this.runSearch(trimmed, false);
  }

  onSearchBlur() {
    // Delay so a tap on a result registers before the list hides
    setTimeout(() => (this.showDropdown = false), 200);
  }

  closeDropdown() {
    this.showDropdown = false;
  }

  async scanPo() {
    const modal = await this.modalCtrl.create({
      component: ScannerModalComponent,
      cssClass: 'scanner-modal',
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<string>();
    const value = data?.trim();
    if (value) {
      this.searchTerm = value;
      await this.runSearch(value, true);
    }
  }

  private async runSearch(term: string, fromScan: boolean) {
    const seq = ++this.searchSeq;
    this.isSearching = true;
    this.showDropdown = true;
    try {
      if (!this.ordersLoaded) {
        await this.loadAllOrders();
      }
      if (seq !== this.searchSeq) return; // stale — a newer search superseded this one

      const t = term.toLowerCase();
      const found = this.allOrders.filter(po =>
        po.PurchaseOrderNumber.toLowerCase().includes(t) ||
        this.vendorOf(po).toLowerCase().includes(t)
      );

      if (fromScan) {
        const exact = found.filter(po => po.PurchaseOrderNumber.toLowerCase() === t);
        const candidates = exact.length > 0 ? exact : found;
        this.matches = candidates;
        if (candidates.length === 1) {
          this.showDropdown = false;
          this.selectPo(candidates[0]);
          return;
        }
      } else {
        this.matches = found;
      }
    } catch {
      if (seq !== this.searchSeq) return;
      this.matches = [];
      const toast = await this.toastCtrl.create({
        message: 'Could not search purchase orders. Check your connection.',
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    } finally {
      if (seq === this.searchSeq) this.isSearching = false;
    }
  }

  private loadAllOrders(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.poService.getAllOrderHeaders().subscribe({
        next: (res) => {
          this.allOrders = res.value;
          this.ordersLoaded = true;
          resolve();
        },
        error: (err) => reject(err instanceof Error ? err : new Error('Failed to load purchase orders')),
      });
    });
  }

  selectPo(po: PurchaseOrderHeader) {
    this.showDropdown = false;
    this.router.navigate(['/purchase-order/receive-by-barcode', po.PurchaseOrderNumber]);
  }

  clearSearch() {
    this.searchTerm = '';
    this.matches = [];
    this.showDropdown = false;
  }
}

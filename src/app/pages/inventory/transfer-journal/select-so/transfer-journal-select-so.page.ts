import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ModalController, ToastController } from '@ionic/angular';
import { SalesOrderService } from '../../../../core/services/sales-order.service';
import { SalesOrderHeaderResponse } from '../../../../models/sales-order.model';
import { ScannerModalComponent } from '../../scanner/scanner-modal.component';

@Component({
  selector: 'app-transfer-journal-select-so',
  templateUrl: './transfer-journal-select-so.page.html',
  styleUrls: ['./transfer-journal-select-so.page.scss'],
  standalone: false,
})
export class TransferJournalSelectSoPage {
  searchTerm = '';
  showDropdown = false;
  isSearching = false;
  matches: SalesOrderHeaderResponse[] = [];

  private allOrders: SalesOrderHeaderResponse[] = [];
  private ordersLoaded = false;
  private searchSeq = 0;

  private router = inject(Router);
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private salesOrderService = inject(SalesOrderService);

  // ── Sales order search (live autocomplete on the search field) ──────
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

  async scanSo() {
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
      const found = this.allOrders.filter(so =>
        so.SalesId.toLowerCase().includes(t) ||
        (so.SalesTable_SalesName ?? '').toLowerCase().includes(t) ||
        so.CustAccount.toLowerCase().includes(t)
      );

      if (fromScan) {
        const exact = found.filter(so => so.SalesId.toLowerCase() === t);
        const candidates = exact.length > 0 ? exact : found;
        this.matches = candidates;
        if (candidates.length === 1) {
          this.showDropdown = false;
          this.selectSo(candidates[0]);
          return;
        }
      } else {
        this.matches = found;
      }
    } catch {
      if (seq !== this.searchSeq) return;
      this.matches = [];
      const toast = await this.toastCtrl.create({
        message: 'Could not search sales orders. Check your connection.',
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
      this.salesOrderService.getAllOrderHeaders().subscribe({
        next: (res) => {
          this.allOrders = res.value;
          this.ordersLoaded = true;
          resolve();
        },
        error: (err) => reject(err instanceof Error ? err : new Error('Failed to load sales orders')),
      });
    });
  }

  selectSo(so: SalesOrderHeaderResponse) {
    this.showDropdown = false;
    this.router.navigate(['/inventory/transfer-journal/from-to', so.SalesId], {
      state: {
        salesOrderName: so.SalesTable_SalesName ?? '',
        custAccount: so.CustAccount,
      },
    });
  }

  clearSearch() {
    this.searchTerm = '';
    this.matches = [];
    this.showDropdown = false;
  }
}

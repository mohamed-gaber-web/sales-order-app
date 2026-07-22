import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalController, ToastController } from '@ionic/angular';
import { VendorReturnService } from '../../../../core/services/vendor-return.service';
import { PurchaseOrderHeader, PurchaseOrderLine } from '../../../../models/purchase-order.model';
import { ScannerModalComponent } from '../../scanner/scanner-modal.component';

@Component({
  selector: 'app-vendor-returns-scan',
  templateUrl: './vendor-returns-scan.page.html',
  styleUrls: ['./vendor-returns-scan.page.scss'],
  standalone: false,
})
export class VendorReturnsScanPage implements OnInit {
  poNumber = '';
  order: PurchaseOrderHeader | null = null;

  searchTerm = '';
  showDropdown = false;
  isSearching = false;
  matches: PurchaseOrderLine[] = [];

  private allLines: PurchaseOrderLine[] = [];
  private linesLoaded = false;
  private searchSeq = 0;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private vendorReturnService = inject(VendorReturnService);

  ngOnInit() {
    this.poNumber = this.route.snapshot.paramMap.get('poNumber') ?? '';
    if (!this.poNumber) {
      this.router.navigate(['/inventory/vendor-returns/select-po']);
    }
  }

  // ── Item search (live autocomplete on the search field) ────
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

  async scanItem() {
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
      if (!this.linesLoaded) {
        await this.loadOrderLines();
      }
      if (seq !== this.searchSeq) return; // stale — a newer search superseded this one

      const t = term.toLowerCase();
      const found = this.allLines.filter(line =>
        line.ItemNumber.toLowerCase().includes(t) ||
        (line.ProductName ?? '').toLowerCase().includes(t)
      );

      if (fromScan) {
        const exact = found.filter(line => line.ItemNumber.toLowerCase() === t);
        const candidates = exact.length > 0 ? exact : found;
        this.matches = candidates;
        if (candidates.length === 1) {
          this.showDropdown = false;
          this.selectLine(candidates[0]);
          return;
        }
      } else {
        this.matches = found;
      }
    } catch {
      if (seq !== this.searchSeq) return;
      this.matches = [];
      const toast = await this.toastCtrl.create({
        message: `Could not load PO ${this.poNumber}. Check your connection.`,
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    } finally {
      if (seq === this.searchSeq) this.isSearching = false;
    }
  }

  private loadOrderLines(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.vendorReturnService.getOrderWithLines(this.poNumber).subscribe({
        next: (order) => {
          this.order = order;
          this.allLines = order.PurchaseOrderLinesV2 ?? [];
          this.linesLoaded = true;
          resolve();
        },
        error: (err) => reject(err instanceof Error ? err : new Error('Failed to load purchase order')),
      });
    });
  }

  /** Jump into the existing multi-line return form with this item pre-selected. */
  selectLine(line: PurchaseOrderLine) {
    this.showDropdown = false;
    this.router.navigate(
      ['/inventory/vendor-returns/return', this.poNumber],
      { state: { preselectLineNumber: line.LineNumber } }
    );
  }

  clearSearch() {
    this.searchTerm = '';
    this.matches = [];
    this.showDropdown = false;
  }

  changeOrder() {
    this.router.navigate(['/inventory/vendor-returns/select-po']);
  }
}

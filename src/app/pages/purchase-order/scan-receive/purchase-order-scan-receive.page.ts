import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalController, ToastController } from '@ionic/angular';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { PurchaseOrderHeader, PurchaseOrderLine } from '../../../models/purchase-order.model';
import { ScannerModalComponent } from '../../inventory/scanner/scanner-modal.component';

@Component({
  selector: 'app-purchase-order-scan-receive',
  templateUrl: './purchase-order-scan-receive.page.html',
  styleUrls: ['./purchase-order-scan-receive.page.scss'],
  standalone: false,
})
export class PurchaseOrderScanReceivePage implements OnInit {
  poNumber = '';
  po: PurchaseOrderHeader | null = null;

  searchTerm = '';
  showDropdown = false;
  isSearching = false;
  matches: PurchaseOrderLine[] = [];

  private openLines: PurchaseOrderLine[] = [];
  private linesLoaded = false;
  private searchSeq = 0;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private poService = inject(PurchaseOrderService);

  private safeNum(val: unknown, fallback = 0): number {
    const n = Number(val);
    return isNaN(n) || n < 0 ? fallback : n;
  }

  getRemainingQty(line: PurchaseOrderLine): number {
    const rem = Number(line.RemainingPurchaseQuantity);
    if (!isNaN(rem) && rem >= 0) return rem;
    return this.safeNum(line.OrderedPurchaseQuantity ?? line.PurchaseQuantity);
  }

  ngOnInit() {
    this.poNumber = this.route.snapshot.paramMap.get('poNumber') ?? '';
    if (!this.poNumber) {
      this.router.navigate(['/purchase-order/receive-by-barcode']);
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
      const found = this.openLines.filter(line =>
        line.ItemNumber.toLowerCase().includes(t) ||
        (line.ProductName ?? '').toLowerCase().includes(t)
      );

      if (fromScan) {
        const exact = found.filter(line => line.ItemNumber.toLowerCase() === t);
        const candidates = exact.length > 0 ? exact : found;
        this.matches = candidates;
        if (candidates.length === 1) {
          this.showDropdown = false;
          this.receive(candidates[0]);
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
      this.poService.getOrderWithLines(this.poNumber).subscribe({
        next: (po) => {
          this.po = po;
          this.openLines = (po.PurchaseOrderLinesV2 ?? []).filter(l => this.getRemainingQty(l) > 0);
          this.linesLoaded = true;
          resolve();
        },
        error: (err) => reject(err instanceof Error ? err : new Error('Failed to load purchase order')),
      });
    });
  }

  receive(line: PurchaseOrderLine) {
    if (!this.po) return;
    this.showDropdown = false;
    this.router.navigate(
      ['/purchase-order/receive', this.poNumber, line.LineNumber],
      { state: { line, po: this.po } }
    );
  }

  clearSearch() {
    this.searchTerm = '';
    this.matches = [];
    this.showDropdown = false;
  }

  changeOrder() {
    this.router.navigate(['/purchase-order/receive-by-barcode']);
  }
}

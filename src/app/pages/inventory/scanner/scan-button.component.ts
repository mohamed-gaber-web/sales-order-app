import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { InventoryService } from '../../../core/services/inventory.service';
import { ScannerModalComponent } from './scanner-modal.component';

/**
 * A scan icon for any item field: opens the scanner and emits the item number.
 *
 * A scanned code may be a product barcode rather than the item number itself,
 * so by default it is resolved through `InventoryService.findItemByScan`. When
 * nothing matches, the raw code is still emitted — the operator sees what was
 * read and can correct it — with a toast saying no item matched.
 */
@Component({
  selector: 'app-scan-button',
  template: `
    <ion-button
      fill="clear"
      [disabled]="busy"
      (click)="scan()"
      [attr.aria-label]="'common.scanQrBarcode' | translate">
      @if (busy) {
        <ion-spinner slot="icon-only" name="dots"></ion-spinner>
      } @else {
        <ion-icon slot="icon-only" name="scan-outline"></ion-icon>
      }
    </ion-button>
  `,
  standalone: false,
})
export class ScanButtonComponent {
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);
  private readonly inventoryService = inject(InventoryService);

  /** Resolve the scanned code to an item number; off to emit the raw code. */
  @Input() resolveItem = true;
  @Output() scanned = new EventEmitter<string>();

  busy = false;

  async scan() {
    const modal = await this.modalCtrl.create({
      component: ScannerModalComponent,
      cssClass: 'scanner-modal',
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<string>();
    const code = data?.trim();
    if (!code) return;

    if (!this.resolveItem) {
      this.scanned.emit(code);
      return;
    }

    this.busy = true;
    this.inventoryService.findItemByScan(code).subscribe({
      next: (hit) => {
        this.busy = false;
        if (hit) {
          this.scanned.emit(hit.product.ProductNumber);
        } else {
          this.scanned.emit(code);
          this.warnNoMatch(code);
        }
      },
      error: () => {
        this.busy = false;
        this.scanned.emit(code);
        this.warnNoMatch(code);
      },
    });
  }

  private async warnNoMatch(code: string) {
    const toast = await this.toastCtrl.create({
      message: this.translate.instant('common.scanNoItem', { code }),
      buttons: [{ text: this.translate.instant('common.dismiss'), role: 'cancel' }],
      color: 'warning',
      position: 'bottom',
    });
    await toast.present();
  }
}

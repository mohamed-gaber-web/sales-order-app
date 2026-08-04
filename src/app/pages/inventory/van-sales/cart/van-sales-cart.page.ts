import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { VanCartService } from '../../../../core/services/van-cart.service';
import { VanCartLine } from '../../../../models/van-sales.model';

@Component({
  selector: 'app-van-sales-cart',
  templateUrl: './van-sales-cart.page.html',
  styleUrls: ['./van-sales-cart.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanSalesCartPage {
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  readonly cart = inject(VanCartService);

  /** Item numbers whose image URL failed to load — they fall back to an initial tile. */
  private readonly brokenImages = signal<ReadonlySet<string>>(new Set());

  imageUrl(line: VanCartLine): string | undefined {
    return this.brokenImages().has(line.itemNumber) ? undefined : line.imageUrl;
  }

  onImageError(line: VanCartLine) {
    this.brokenImages.update((set) => new Set(set).add(line.itemNumber));
  }

  lineTotal(line: VanCartLine): number {
    return line.qty * line.price;
  }

  adjust(line: VanCartLine, delta: number) {
    this.cart.adjustQty(line.itemNumber, delta);
  }

  /** Commits the typed quantity. An empty or invalid entry reverts to 1 rather than dropping the line. */
  onQtyInput(line: VanCartLine, raw: string | number | null | undefined) {
    const parsed = Math.floor(Number(raw));
    this.cart.setQty(line.itemNumber, Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
  }

  async remove(line: VanCartLine) {
    this.cart.remove(line.itemNumber);
    const toast = await this.toastCtrl.create({
      message: `${line.itemNumber} removed`,
      duration: 1600,
      position: 'top',
      color: 'medium',
    });
    await toast.present();
  }

  async confirmClear() {
    const alert = await this.alertCtrl.create({
      header: 'Empty the cart?',
      message: `This removes all ${this.cart.count()} product${this.cart.count() === 1 ? '' : 's'}. You'll need to pick them again.`,
      buttons: [
        { text: 'Keep cart', role: 'cancel' },
        { text: 'Empty cart', role: 'destructive', handler: () => this.cart.clear() },
      ],
    });
    await alert.present();
  }

  addMore() {
    this.router.navigate(['/inventory/van-sales/catalog']);
  }

  goToCheckout() {
    if (this.cart.isEmpty()) return;
    this.router.navigate(['/inventory/van-sales/checkout']);
  }

  initials(line: VanCartLine): string {
    const source = (line.name || line.itemNumber).replace(/[^A-Za-z0-9 ]/g, ' ').trim();
    const words = source.split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  tileHue(line: VanCartLine): number {
    let hash = 0;
    for (let i = 0; i < line.itemNumber.length; i++) {
      hash = (hash * 31 + line.itemNumber.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 360;
  }
}

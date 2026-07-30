import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';
import { PdfService, VanSaleLabelData } from '../../../../core/services/pdf.service';
import { VanSaleResult } from '../../../../models/van-sales.model';

@Component({
  selector: 'app-van-sales-label-modal',
  templateUrl: './van-sales-label-modal.component.html',
  styleUrls: ['./van-sales-label-modal.component.scss'],
  standalone: false,
})
export class VanSalesLabelModalComponent implements OnInit {
  @Input() sale!: VanSaleResult;

  readonly previewSrc = signal('');
  readonly isBusy = signal(false);
  readonly renderFailed = signal(false);

  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private pdfService = inject(PdfService);

  private labelData!: VanSaleLabelData;

  ngOnInit() {
    this.labelData = this.buildLabelData();
    try {
      this.previewSrc.set(this.pdfService.getVanSaleLabelPreviewDataUrl(this.labelData));
    } catch {
      this.renderFailed.set(true);
    }
  }

  private buildLabelData(): VanSaleLabelData {
    return {
      orderNumber: this.sale.orderNumber,
      customerAccount: this.sale.customerAccount,
      customerName: this.sale.customerName,
      currencyCode: this.sale.currencyCode,
      warehouseId: this.sale.warehouseId,
      siteId: this.sale.siteId,
      // Lines D365 rejected never left the van, so they don't belong on the label.
      lines: this.sale.lines
        .filter((l) => !this.sale.failedItems.includes(l.itemNumber))
        .map((l) => ({
          itemNumber: l.itemNumber,
          name: l.name,
          qty: l.qty,
          unit: l.unit,
          price: l.price,
        })),
      totalQty: this.sale.totalQty,
      totalAmount: this.sale.totalAmount,
      soldAt: this.sale.soldAt,
    };
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }

  async download() {
    if (this.isBusy()) return;
    this.isBusy.set(true);
    try {
      const uri = await this.pdfService.downloadVanSaleLabel(this.labelData);
      if (uri) await this.toast('Label saved to your files.', 'success');
    } catch {
      await this.toast('Could not save the label. Try again.', 'danger');
    } finally {
      this.isBusy.set(false);
    }
  }

  async share() {
    if (this.isBusy()) return;
    this.isBusy.set(true);
    try {
      await this.pdfService.shareVanSaleLabel(this.labelData);
    } catch {
      await this.toast('Could not share the label. Try again.', 'danger');
    } finally {
      this.isBusy.set(false);
    }
  }

  private async toast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}

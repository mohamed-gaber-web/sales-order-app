import { Component, Input, OnInit, inject } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';
import { PdfService, FinishedGoodsLabelData } from '../../../../core/services/pdf.service';

@Component({
  selector: 'app-finished-goods-label-modal',
  templateUrl: './finished-goods-label-modal.component.html',
  styleUrls: ['./finished-goods-label-modal.component.scss'],
  standalone: false,
})
export class FinishedGoodsLabelModalComponent implements OnInit {
  @Input() labelData!: FinishedGoodsLabelData;

  previewSrc = '';
  isBusy = false;

  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private pdfService = inject(PdfService);

  ngOnInit() {
    this.previewSrc = this.pdfService.getFinishedGoodsLabelPreviewDataUrl(this.labelData);
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }

  async download() {
    if (this.isBusy) return;
    this.isBusy = true;
    try {
      const uri = await this.pdfService.downloadFinishedGoodsLabel(this.labelData);
      if (uri) {
        const toast = await this.toastCtrl.create({
          message: 'Label saved to your files.',
          duration: 3000,
          color: 'success',
          position: 'bottom'
        });
        await toast.present();
      }
    } catch {
      const toast = await this.toastCtrl.create({
        message: 'Could not save label. Try again.',
        duration: 3000,
        color: 'danger',
        position: 'bottom'
      });
      await toast.present();
    } finally {
      this.isBusy = false;
    }
  }

  async share() {
    if (this.isBusy) return;
    this.isBusy = true;
    try {
      await this.pdfService.shareFinishedGoodsLabel(this.labelData);
    } catch {
      const toast = await this.toastCtrl.create({
        message: 'Could not share label. Try again.',
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
        color: 'danger',
        position: 'bottom'
      });
      await toast.present();
    } finally {
      this.isBusy = false;
    }
  }
}

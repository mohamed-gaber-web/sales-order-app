import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, ModalController, ToastController } from '@ionic/angular';
import { PoScanDocumentService } from './po-scan-document.service';
import {
  CaptureSource,
  ScanActionResult,
  ScanConfidence,
  ScanMatchStatus,
  ScannedDocumentType,
} from '../../../models/po-document-scan.model';
import { PurchaseOrderLine } from '../../../models/purchase-order.model';
import { ReceiptLabelData } from '../../../core/services/pdf.service';
import { LabelPreviewModalComponent } from '../label-preview/label-preview-modal.component';

interface PillStyle {
  label: string;
  color: string;
  bg: string;
}

/** Human-readable label for what the reader decided the document is. */
const DOCUMENT_TYPE_LABELS: Record<ScannedDocumentType, string> = {
  purchase_order: 'Purchase Order',
  delivery_note: 'Delivery Note',
  packing_slip: 'Packing Slip',
  invoice: 'Invoice',
  other: 'Unrecognised Document',
};

// Presentation lookups — colours come from the design-system tokens, never literals.
const TYPE_PILLS: Record<ScannedDocumentType, Omit<PillStyle, 'label'>> = {
  purchase_order: { color: 'var(--ds-navy)', bg: 'var(--ds-navy-soft)' },
  delivery_note: { color: 'var(--ds-warning)', bg: 'var(--ds-warning-soft)' },
  packing_slip: { color: 'var(--ds-warning)', bg: 'var(--ds-warning-soft)' },
  invoice: { color: 'var(--ds-warning)', bg: 'var(--ds-warning-soft)' },
  other: { color: 'var(--ds-danger)', bg: 'var(--ds-danger-soft)' },
};

const CONFIDENCE_PILLS: Record<ScanConfidence, PillStyle> = {
  high: { label: 'Read cleanly', color: 'var(--ds-success)', bg: 'var(--ds-success-soft)' },
  medium: { label: 'Check the values', color: 'var(--ds-warning)', bg: 'var(--ds-warning-soft)' },
  low: { label: 'Hard to read — verify', color: 'var(--ds-danger)', bg: 'var(--ds-danger-soft)' },
};

const STATUS_PILLS: Record<ScanMatchStatus, PillStyle> = {
  matched: { label: 'On order', color: 'var(--ds-success)', bg: 'var(--ds-success-soft)' },
  'fully-received': { label: 'Already received', color: 'var(--ds-txt-2)', bg: 'var(--ds-line-soft)' },
  'not-on-order': { label: 'Not on order', color: 'var(--ds-danger)', bg: 'var(--ds-danger-soft)' },
};

@Component({
  selector: 'app-purchase-order-scan-document',
  templateUrl: './purchase-order-scan-document.page.html',
  styleUrls: ['./purchase-order-scan-document.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseOrderScanDocumentPage {
  readonly vm = inject(PoScanDocumentService);

  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly actionSheetCtrl = inject(ActionSheetController);
  private readonly modalCtrl = inject(ModalController);

  /** Cleared on entry so a second visit never opens on the last scan's result. */
  ionViewWillEnter(): void {
    this.vm.reset();
  }

  documentTypeLabel(type: ScannedDocumentType): string {
    return DOCUMENT_TYPE_LABELS[type];
  }

  typePill(type: ScannedDocumentType): Omit<PillStyle, 'label'> {
    return TYPE_PILLS[type];
  }

  confidencePill(confidence: ScanConfidence): PillStyle {
    return CONFIDENCE_PILLS[confidence];
  }

  statusPill(status: ScanMatchStatus): PillStyle {
    return STATUS_PILLS[status];
  }

  async scan(source: CaptureSource): Promise<void> {
    this.report(await this.vm.scanDocument(source));
  }

  async matchToOrder(): Promise<void> {
    this.report(await this.vm.matchToOrder());
  }

  async submitReceipt(): Promise<void> {
    this.report(await this.vm.submitReceipt());
  }

  onPoNumberChange(value: string): void {
    this.vm.setPoNumber(value);
  }

  onQtyChange(index: number, value: string | number | null | undefined): void {
    this.vm.setRowQty(index, Number(value ?? 0));
  }

  scanAnother(): void {
    this.vm.reset();
  }

  goToOrder(): void {
    this.router.navigate(['/purchase-order/detail', this.vm.poNumber()]);
  }

  backToReview(): void {
    this.vm.backToReview();
  }

  addOrderLine(line: PurchaseOrderLine): void {
    this.vm.addOrderLine(line);
  }

  async printLabel(): Promise<void> {
    const receipt = this.vm.confirmed();
    if (!receipt || receipt.lines.length === 0) return;

    if (receipt.lines.length === 1) {
      await this.openLabelPreview(0);
      return;
    }

    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Print label for…',
      buttons: [
        ...receipt.lines.map((line, index) => ({
          text: `${line.itemNumber} — ${line.qty}${line.unit ? ' ' + line.unit : ''}`,
          icon: 'pricetag-outline',
          handler: () => {
            void this.openLabelPreview(index);
          },
        })),
        { text: 'Cancel', icon: 'close-outline', role: 'cancel' },
      ],
    });
    await actionSheet.present();
  }

  private async openLabelPreview(index: number): Promise<void> {
    const receipt = this.vm.confirmed();
    const line = receipt?.lines[index];
    if (!receipt || !line) return;

    const labelData: ReceiptLabelData = {
      poNumber: receipt.poNumber,
      lineNumber: index + 1,
      packingSlipId: receipt.packingSlipId,
      itemNumber: line.itemNumber,
      productName: line.productName,
      qty: line.qty,
      unit: line.unit,
      receiptDate: new Date(),
    };

    const modal = await this.modalCtrl.create({
      component: LabelPreviewModalComponent,
      componentProps: { labelData },
      cssClass: 'label-preview-modal',
      breakpoints: [0, 0.9],
      initialBreakpoint: 0.9,
    });
    await modal.present();
  }

  private async report(result: ScanActionResult): Promise<void> {
    if (result.ok || !result.message) return;

    const toast = await this.toastCtrl.create({
      message: result.message,
      buttons: [{ text: 'Dismiss', role: 'cancel' }],
      color: 'danger',
      position: 'bottom',
    });
    await toast.present();
  }
}

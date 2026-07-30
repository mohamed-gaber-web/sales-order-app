import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** Lines printed on a van-sale label before it summarises the rest as "+ N more". */
const VAN_LABEL_MAX_LINES = 12;

export interface ReceiptPdfData {
  poNumber: string;
  lineNumber: number;
  dataAreaId: string;
  packingSlipId: string;
  receiptQty: number;
  itemNumber: string;
  productName?: string;
  unit?: string;
  unitPrice?: number;
  currency?: string;
  warehouse?: string;
  vendor?: string;
  receiptDate: Date;
}

export interface ReceiptLabelData {
  poNumber: string;
  lineNumber: number;
  packingSlipId: string;
  itemNumber: string;
  productName?: string;
  qty: number;
  unit?: string;
  receiptDate: Date;
}

export interface FinishedGoodsLabelData {
  productionOrderNumber: string;
  itemNumber: string;
  productName?: string;
  qty: number;
  unit?: string;
  /** D365 report-as-finished journal the quantity was posted through. */
  journalNumber: string;
  reportDate: Date;
}

export interface CycleCountLabelData {
  itemNumber: string;
  productName?: string;
  qty: number;
  unit?: string;
  /** D365 counting journal the count was recorded in. */
  journalNumber: string;
  warehouseId?: string;
  countDate: Date;
}

export interface VanSaleLabelLine {
  itemNumber: string;
  name: string;
  qty: number;
  unit?: string;
  price: number;
}

/** One label per completed van sale — the driver hands it over with the goods. */
export interface VanSaleLabelData {
  orderNumber: string;
  customerAccount: string;
  customerName: string;
  currencyCode: string;
  warehouseId?: string;
  siteId?: string;
  lines: VanSaleLabelLine[];
  totalQty: number;
  totalAmount: number;
  soldAt: Date;
}

export interface PackingSlipLine {
  itemNumber: string;
  productName?: string;
  quantity: number;
  unit?: string;
}

export interface PackingSlipPdfData {
  salesOrderId: string;
  packingSlipId: string;
  dataAreaId: string;
  customerAccount?: string;
  customerName?: string;
  warehouse?: string;
  slipDate: Date;
  lines?: PackingSlipLine[];
}

// No external dependencies — uses Canvas API + inline minimal PDF builder.
@Injectable({ providedIn: 'root' })
export class PdfService {

  async downloadReceipt(data: ReceiptPdfData): Promise<string | null> {
    const blob = await this.generatePdf(data);
    return this.savePdf(blob, `receipt-${data.packingSlipId}.pdf`);
  }

  async shareReceipt(data: ReceiptPdfData): Promise<void> {
    const blob = await this.generatePdf(data);
    await this.sharePdfBlob(blob, `receipt-${data.packingSlipId}.pdf`);
  }

  private async savePdf(blob: Blob, filename: string): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      const base64 = await this.blobToBase64(blob);
      // Directory.External maps to app-specific external storage (visible in file manager,
      // no runtime permission needed on Android 4.4+).
      const result = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.External });
      return result.uri;
    } else {
      this.triggerBrowserDownload(blob, filename);
      return null;
    }
  }

  private async sharePdfBlob(blob: Blob, filename: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const base64 = await this.blobToBase64(blob);
      const result = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
      await Share.share({ title: filename, url: result.uri });
    } else {
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
      } else {
        this.triggerBrowserDownload(blob, filename);
      }
    }
  }

  private triggerBrowserDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private async generatePdf(data: ReceiptPdfData): Promise<Blob> {
    const canvas = this.renderToCanvas(data);
    const jpegBytes = await this.canvasToJpeg(canvas);
    return this.buildPdf(jpegBytes, canvas.width, canvas.height);
  }

  // ── Canvas renderer ────────────────────────────────────────

  private renderToCanvas(data: ReceiptPdfData): HTMLCanvasElement {
    const W = 595;
    const H = 842;
    const S = 2; // retina scale
    const canvas = document.createElement('canvas');
    canvas.width = W * S;
    canvas.height = H * S;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.scale(S, S);
    this.drawReceipt(ctx, data, W, H);
    return canvas;
  }

  private drawReceipt(
    ctx: CanvasRenderingContext2D,
    data: ReceiptPdfData,
    W: number,
    H: number
  ): void {
    const margin = 30;
    const contentW = W - margin * 2;
    const midX = margin + contentW / 2;
    const navy = '#002559';
    const orange = '#F24C1A';
    const lightBlue = 'rgba(160,190,225,0.9)';
    const muted = '#828da8';
    const dark = '#121c30';

    // White page
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // ── Header ─────────────────────────────────────────────
    ctx.fillStyle = navy;
    ctx.fillRect(0, 0, W, 108);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px Arial,Helvetica,sans-serif';
    ctx.fillText('GROW PATH', margin, 44);

    ctx.fillStyle = lightBlue;
    ctx.font = '13px Arial,Helvetica,sans-serif';
    ctx.fillText('PRODUCT RECEIPT', margin, 66);

    const dateStr = data.receiptDate.toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    // Two right-aligned columns: labels end at labelRight, values end at W - margin.
    const labelRight = W - margin - 95;
    const metaRow = (label: string, value: string, ry: number) => {
      ctx.textAlign = 'right';
      ctx.fillStyle = lightBlue;
      ctx.font = '11px Arial,Helvetica,sans-serif';
      ctx.fillText(label, labelRight, ry);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px Arial,Helvetica,sans-serif';
      ctx.fillText(value, W - margin, ry);
      ctx.textAlign = 'left';
    };
    metaRow('Receipt ID', data.packingSlipId, 36);
    metaRow('Date', dateStr, 54);
    metaRow('Company', data.dataAreaId.toUpperCase(), 72);

    // Orange accent
    ctx.fillStyle = orange;
    ctx.fillRect(0, 108, W, 5);

    let y = 130;

    // ── Section helper ───────────────────────────────────────
    const section = (title: string) => {
      ctx.fillStyle = '#f4f6fb';
      ctx.fillRect(margin, y, contentW, 28);
      ctx.fillStyle = navy;
      ctx.fillRect(margin, y, 4, 28);
      ctx.fillStyle = navy;
      ctx.font = 'bold 9.5px Arial,Helvetica,sans-serif';
      ctx.fillText(title, margin + 14, y + 18);
      y += 38;
    };

    // ── Field helper (label + value) ─────────────────────────
    const maxFieldW = contentW / 2 - 14;
    const clamp = (text: string, font: string): string => {
      ctx.font = font;
      if (ctx.measureText(text).width <= maxFieldW) return text;
      let t = text;
      while (t.length > 1 && ctx.measureText(t + '…').width > maxFieldW) {
        t = t.slice(0, -1);
      }
      return t + '…';
    };

    const field = (label: string, value: string, x: number) => {
      ctx.fillStyle = muted;
      ctx.font = '10px Arial,Helvetica,sans-serif';
      ctx.fillText(label, x, y);
      const valueFont = 'bold 13.5px Arial,Helvetica,sans-serif';
      ctx.fillStyle = dark;
      ctx.fillText(clamp(value, valueFont), x, y + 18);
    };

    // ── PURCHASE ORDER ───────────────────────────────────────
    section('PURCHASE ORDER');
    field('Purchase Order', data.poNumber, margin);
    field('Line', `# ${data.lineNumber}`, midX);
    y += 32;
    if (data.vendor) {
      field('Vendor', data.vendor, margin);
      y += 32;
    }
    y += 12;

    // ── ITEM DETAILS ─────────────────────────────────────────
    section('ITEM DETAILS');
    field('Item Number', data.itemNumber, margin);
    if (data.productName) field('Product Name', data.productName, midX);
    y += 32;
    if (data.warehouse) {
      field('Warehouse', data.warehouse, margin);
      y += 32;
    }
    y += 12;

    // ── RECEIPT DETAILS ──────────────────────────────────────
    section('RECEIPT DETAILS');
    const qtyStr = `${Number(data.receiptQty).toLocaleString('en-US', {
      minimumFractionDigits: 3, maximumFractionDigits: 3
    })}${data.unit ? '  ' + data.unit : ''}`;
    field('Quantity Received', qtyStr, margin);
    y += 32;

    // ── Footer ────────────────────────────────────────────────
    ctx.fillStyle = '#f4f6fb';
    ctx.fillRect(0, H - 36, W, 18);
    ctx.fillStyle = muted;
    ctx.font = '10px Arial,Helvetica,sans-serif';
    ctx.fillText('Generated by Grow Path', margin, H - 23);
    ctx.textAlign = 'right';
    ctx.fillText(data.receiptDate.toLocaleString(), W - margin, H - 23);
    ctx.textAlign = 'left';

    ctx.fillStyle = orange;
    ctx.fillRect(0, H - 18, W, 18);
  }

  // ── Packing Slip ───────────────────────────────────────────

  async downloadPackingSlip(data: PackingSlipPdfData): Promise<string | null> {
    const blob = await this.generatePackingSlipPdf(data);
    return this.savePdf(blob, `packing-slip-${data.packingSlipId}.pdf`);
  }

  async sharePackingSlip(data: PackingSlipPdfData): Promise<void> {
    const blob = await this.generatePackingSlipPdf(data);
    await this.sharePdfBlob(blob, `packing-slip-${data.packingSlipId}.pdf`);
  }

  private async generatePackingSlipPdf(data: PackingSlipPdfData): Promise<Blob> {
    const canvas = this.renderPackingSlipToCanvas(data);
    const jpegBytes = await this.canvasToJpeg(canvas);
    return this.buildPdf(jpegBytes, canvas.width, canvas.height);
  }

  private renderPackingSlipToCanvas(data: PackingSlipPdfData): HTMLCanvasElement {
    const W = 595;
    const H = this.packingSlipHeight(data);
    const S = 2;
    const canvas = document.createElement('canvas');
    canvas.width = W * S;
    canvas.height = H * S;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.scale(S, S);
    this.drawPackingSlip(ctx, data, W, H);
    return canvas;
  }

  // Height grows with the number of line items. Mirror the y increments in
  // drawPackingSlip exactly — keep the two in sync.
  private packingSlipHeight(data: PackingSlipPdfData): number {
    let y = 130;
    y += 38 + 32 + 12;                               // SALES ORDER
    if (data.customerAccount || data.customerName) {
      y += 38 + 32 + 12;                             // CUSTOMER
    }
    y += 38 + 32 + 20;                               // SHIPMENT DETAILS
    if (data.lines?.length) {
      y += 38 + 26 + data.lines.length * 26 + 6;     // LINE ITEMS
    }
    y += 80;                                         // confirmation stamp
    return y + 36;                                   // small gap + footer band (size to content)
  }

  private drawPackingSlip(
    ctx: CanvasRenderingContext2D,
    data: PackingSlipPdfData,
    W: number,
    H: number
  ): void {
    const margin = 30;
    const contentW = W - margin * 2;
    const midX = margin + contentW / 2;
    const navy = '#002559';
    const orange = '#F24C1A';
    const lightBlue = 'rgba(160,190,225,0.9)';
    const muted = '#828da8';
    const dark = '#121c30';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // ── Header ─────────────────────────────────────────────
    ctx.fillStyle = navy;
    ctx.fillRect(0, 0, W, 108);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px Arial,Helvetica,sans-serif';
    ctx.fillText('GROW PATH', margin, 44);

    ctx.fillStyle = lightBlue;
    ctx.font = '13px Arial,Helvetica,sans-serif';
    ctx.fillText('PACKING SLIP', margin, 66);

    const dateStr = data.slipDate.toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    // Two right-aligned columns: labels end at labelRight, values end at W - margin.
    const labelRight = W - margin - 95;
    const metaRow = (label: string, value: string, ry: number) => {
      ctx.textAlign = 'right';
      ctx.fillStyle = lightBlue;
      ctx.font = '11px Arial,Helvetica,sans-serif';
      ctx.fillText(label, labelRight, ry);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px Arial,Helvetica,sans-serif';
      ctx.fillText(value, W - margin, ry);
      ctx.textAlign = 'left';
    };
    metaRow('Packing Slip', data.packingSlipId, 36);
    metaRow('Date', dateStr, 54);
    metaRow('Company', data.dataAreaId.toUpperCase(), 72);

    ctx.fillStyle = orange;
    ctx.fillRect(0, 108, W, 5);

    let y = 130;

    const section = (title: string) => {
      ctx.fillStyle = '#f4f6fb';
      ctx.fillRect(margin, y, contentW, 28);
      ctx.fillStyle = navy;
      ctx.fillRect(margin, y, 4, 28);
      ctx.fillStyle = navy;
      ctx.font = 'bold 9.5px Arial,Helvetica,sans-serif';
      ctx.fillText(title, margin + 14, y + 18);
      y += 38;
    };

    const maxFieldW = contentW / 2 - 14;
    const clamp = (text: string): string => {
      ctx.font = 'bold 13.5px Arial,Helvetica,sans-serif';
      if (ctx.measureText(text).width <= maxFieldW) return text;
      let t = text;
      while (t.length > 1 && ctx.measureText(t + '…').width > maxFieldW) t = t.slice(0, -1);
      return t + '…';
    };

    const field = (label: string, value: string, x: number) => {
      ctx.fillStyle = muted;
      ctx.font = '10px Arial,Helvetica,sans-serif';
      ctx.fillText(label, x, y);
      ctx.fillStyle = dark;
      ctx.font = 'bold 13.5px Arial,Helvetica,sans-serif';
      ctx.fillText(clamp(value), x, y + 18);
    };

    // ── SALES ORDER ──────────────────────────────────────────
    section('SALES ORDER');
    field('Sales Order', data.salesOrderId, margin);
    field('Packing Slip', data.packingSlipId, midX);
    y += 32;
    y += 12;

    // ── CUSTOMER ─────────────────────────────────────────────
    if (data.customerAccount || data.customerName) {
      section('CUSTOMER');
      if (data.customerAccount) {
        field('Account', data.customerAccount, margin);
      }
      if (data.customerName) {
        field('Name', data.customerName, data.customerAccount ? midX : margin);
      }
      y += 32;
      y += 12;
    }

    // ── SHIPMENT DETAILS ─────────────────────────────────────
    section('SHIPMENT DETAILS');
    if (data.warehouse) {
      field('Warehouse', data.warehouse, margin);
    }
    field('Shipped Lines', 'All remaining lines', data.warehouse ? midX : margin);
    y += 32;
    y += 20;

    // ── LINE ITEMS ───────────────────────────────────────────
    if (data.lines?.length) {
      const clampW = (text: string, font: string, maxW: number): string => {
        ctx.font = font;
        if (ctx.measureText(text).width <= maxW) return text;
        let t = text;
        while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
        return t + '…';
      };

      section('LINE ITEMS');

      const qtyX = W - margin;
      const itemX = margin;
      const prodX = margin + 110;
      const itemW = prodX - itemX - 12;
      const prodW = qtyX - prodX - 70;

      // Column headers
      ctx.fillStyle = muted;
      ctx.font = 'bold 8.5px Arial,Helvetica,sans-serif';
      ctx.fillText('ITEM', itemX, y);
      ctx.fillText('PRODUCT', prodX, y);
      ctx.textAlign = 'right';
      ctx.fillText('QTY', qtyX, y);
      ctx.textAlign = 'left';
      y += 8;
      ctx.strokeStyle = '#dbe1ec';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margin, y);
      ctx.lineTo(W - margin, y);
      ctx.stroke();
      y += 18;

      for (const line of data.lines) {
        ctx.fillStyle = dark;
        ctx.font = 'bold 11px Arial,Helvetica,sans-serif';
        ctx.fillText(clampW(line.itemNumber, 'bold 11px Arial,Helvetica,sans-serif', itemW), itemX, y);

        ctx.fillStyle = '#3a4356';
        ctx.font = '11px Arial,Helvetica,sans-serif';
        ctx.fillText(clampW(line.productName ?? '—', '11px Arial,Helvetica,sans-serif', prodW), prodX, y);

        const qtyStr = `${Number(line.quantity).toLocaleString('en-US', {
          maximumFractionDigits: 2
        })}${line.unit ? ' ' + line.unit : ''}`;
        ctx.fillStyle = dark;
        ctx.font = 'bold 11px Arial,Helvetica,sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(qtyStr, qtyX, y);
        ctx.textAlign = 'left';

        y += 8;
        ctx.strokeStyle = '#eef1f7';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(margin, y);
        ctx.lineTo(W - margin, y);
        ctx.stroke();
        y += 18;
      }
      y += 6;
    }

    // ── Confirmation stamp ───────────────────────────────────
    ctx.fillStyle = navy;
    ctx.fillRect(margin, y, contentW, 64);

    // Checkmark circle
    const cx = margin + 38;
    const cy = y + 32;
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy);
    ctx.lineTo(cx - 2, cy + 8);
    ctx.lineTo(cx + 10, cy - 8);
    ctx.stroke();

    ctx.fillStyle = lightBlue;
    ctx.font = '10px Arial,Helvetica,sans-serif';
    ctx.fillText('STATUS', margin + 68, y + 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial,Helvetica,sans-serif';
    ctx.fillText('Packing Slip Posted', margin + 68, y + 42);
    y += 80;

    // ── Footer ────────────────────────────────────────────────
    ctx.fillStyle = '#f4f6fb';
    ctx.fillRect(0, H - 36, W, 18);
    ctx.fillStyle = muted;
    ctx.font = '10px Arial,Helvetica,sans-serif';
    ctx.fillText('Generated by Grow Path', margin, H - 23);
    ctx.textAlign = 'right';
    ctx.fillText(data.slipDate.toLocaleString(), W - margin, H - 23);
    ctx.textAlign = 'left';

    ctx.fillStyle = orange;
    ctx.fillRect(0, H - 18, W, 18);
  }

  // ── Receipt Label (one per received item, with a Code 128 barcode) ──

  /** Renders the label to a data URL so it can be shown on-screen before the user downloads or shares it. */
  getLabelPreviewDataUrl(data: ReceiptLabelData): string {
    return this.renderLabelToCanvas(data).toDataURL('image/png');
  }

  async downloadReceiptLabel(data: ReceiptLabelData): Promise<string | null> {
    const blob = await this.generateLabelPdf(data);
    return this.savePdf(blob, `label-${data.itemNumber}-${data.packingSlipId}.pdf`);
  }

  async shareReceiptLabel(data: ReceiptLabelData): Promise<void> {
    const blob = await this.generateLabelPdf(data);
    await this.sharePdfBlob(blob, `label-${data.itemNumber}-${data.packingSlipId}.pdf`);
  }

  private async generateLabelPdf(data: ReceiptLabelData): Promise<Blob> {
    const canvas = this.renderLabelToCanvas(data);
    const jpegBytes = await this.canvasToJpeg(canvas);
    return this.buildPdf(jpegBytes, canvas.width, canvas.height);
  }

  private renderLabelToCanvas(data: ReceiptLabelData): HTMLCanvasElement {
    const W = 400;
    const H = 260;
    const S = 3; // extra scale — keeps the barcode bars crisp at print resolution
    const canvas = document.createElement('canvas');
    canvas.width = W * S;
    canvas.height = H * S;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.scale(S, S);
    this.drawLabel(ctx, data, W, H);
    return canvas;
  }

  private drawLabel(ctx: CanvasRenderingContext2D, data: ReceiptLabelData, W: number, H: number): void {
    const margin = 16;
    const navy = '#002559';
    const orange = '#F24C1A';
    const dark = '#121c30';
    const muted = '#5b6478';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#d8dce6';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

    // ── Header ─────────────────────────────────────────────
    ctx.fillStyle = navy;
    ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial,Helvetica,sans-serif';
    ctx.fillText('GROW PATH', margin, 22);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '10px Arial,Helvetica,sans-serif';
    ctx.fillText('RECEIVING LABEL', W - margin, 22);
    ctx.textAlign = 'left';

    ctx.fillStyle = orange;
    ctx.fillRect(0, 34, W, 3);

    const contentW = W - margin * 2;
    const clamp = (text: string, font: string, maxW: number): string => {
      ctx.font = font;
      if (ctx.measureText(text).width <= maxW) return text;
      let t = text;
      while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
      return t + '…';
    };

    let y = 56;

    // ── Purchase order + line ───────────────────────────────
    ctx.fillStyle = muted;
    ctx.font = '9px Arial,Helvetica,sans-serif';
    ctx.fillText('PURCHASE ORDER', margin, y);
    ctx.fillStyle = dark;
    ctx.font = 'bold 15px Arial,Helvetica,sans-serif';
    ctx.fillText(clamp(`${data.poNumber}  ·  Line ${data.lineNumber}`, 'bold 15px Arial,Helvetica,sans-serif', contentW), margin, y + 17);
    y += 36;

    // ── Item ─────────────────────────────────────────────────
    ctx.fillStyle = muted;
    ctx.font = '9px Arial,Helvetica,sans-serif';
    ctx.fillText('ITEM', margin, y);
    ctx.fillStyle = dark;
    ctx.font = 'bold 20px Arial,Helvetica,sans-serif';
    ctx.fillText(clamp(data.itemNumber, 'bold 20px Arial,Helvetica,sans-serif', contentW), margin, y + 20);
    y += 24;
    if (data.productName) {
      ctx.fillStyle = muted;
      ctx.font = '11px Arial,Helvetica,sans-serif';
      ctx.fillText(clamp(data.productName, '11px Arial,Helvetica,sans-serif', contentW), margin, y + 10);
      y += 16;
    }
    y += 8;

    // ── Quantity received ────────────────────────────────────
    ctx.fillStyle = muted;
    ctx.font = '9px Arial,Helvetica,sans-serif';
    ctx.fillText('QTY RECEIVED', margin, y);
    ctx.fillStyle = orange;
    ctx.font = 'bold 22px Arial,Helvetica,sans-serif';
    const qtyStr = `${Number(data.qty).toLocaleString('en-US', { maximumFractionDigits: 3 })}${data.unit ? ' ' + data.unit : ''}`;
    ctx.fillText(qtyStr, margin, y + 22);

    // ── Barcode (encodes the item number) ───────────────────
    const barcodeHeight = 40;
    const barcodeY = H - 68;
    this.drawBarcode(ctx, data.itemNumber, margin, barcodeY, contentW, barcodeHeight);

    ctx.textAlign = 'center';
    ctx.fillStyle = dark;
    ctx.font = '10px Arial,Helvetica,sans-serif';
    ctx.fillText(data.itemNumber, W / 2, barcodeY + barcodeHeight + 13);
    ctx.textAlign = 'left';

    // ── Footer ────────────────────────────────────────────────
    ctx.fillStyle = muted;
    ctx.font = '8px Arial,Helvetica,sans-serif';
    ctx.fillText(`Receipt ${data.packingSlipId}`, margin, H - 8);
    ctx.textAlign = 'right';
    ctx.fillText(
      data.receiptDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      W - margin,
      H - 8
    );
    ctx.textAlign = 'left';
  }

  // ── Cycle Count Label (one per counted item, with a Code 128 barcode) ──

  /** Renders the label to a data URL so it can be shown on-screen before the user downloads or shares it. */
  getCycleCountLabelPreviewDataUrl(data: CycleCountLabelData): string {
    return this.renderCycleCountLabelToCanvas(data).toDataURL('image/png');
  }

  async downloadCycleCountLabel(data: CycleCountLabelData): Promise<string | null> {
    const blob = await this.generateCycleCountLabelPdf(data);
    return this.savePdf(blob, `count-${data.itemNumber}-${data.journalNumber}.pdf`);
  }

  async shareCycleCountLabel(data: CycleCountLabelData): Promise<void> {
    const blob = await this.generateCycleCountLabelPdf(data);
    await this.sharePdfBlob(blob, `count-${data.itemNumber}-${data.journalNumber}.pdf`);
  }

  private async generateCycleCountLabelPdf(data: CycleCountLabelData): Promise<Blob> {
    const canvas = this.renderCycleCountLabelToCanvas(data);
    const jpegBytes = await this.canvasToJpeg(canvas);
    return this.buildPdf(jpegBytes, canvas.width, canvas.height);
  }

  private renderCycleCountLabelToCanvas(data: CycleCountLabelData): HTMLCanvasElement {
    const W = 400;
    const H = 260;
    const S = 3; // extra scale — keeps the barcode bars crisp at print resolution
    const canvas = document.createElement('canvas');
    canvas.width = W * S;
    canvas.height = H * S;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.scale(S, S);
    this.drawCycleCountLabel(ctx, data, W, H);
    return canvas;
  }

  private drawCycleCountLabel(ctx: CanvasRenderingContext2D, data: CycleCountLabelData, W: number, H: number): void {
    const margin = 16;
    const navy = '#002559';
    const orange = '#F24C1A';
    const dark = '#121c30';
    const muted = '#5b6478';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#d8dce6';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

    // ── Header ─────────────────────────────────────────────
    ctx.fillStyle = navy;
    ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial,Helvetica,sans-serif';
    ctx.fillText('GROW PATH', margin, 22);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '10px Arial,Helvetica,sans-serif';
    ctx.fillText('CYCLE COUNT LABEL', W - margin, 22);
    ctx.textAlign = 'left';

    ctx.fillStyle = orange;
    ctx.fillRect(0, 34, W, 3);

    const contentW = W - margin * 2;
    const clamp = (text: string, font: string, maxW: number): string => {
      ctx.font = font;
      if (ctx.measureText(text).width <= maxW) return text;
      let t = text;
      while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
      return t + '…';
    };

    let y = 56;

    // ── Journal (+ warehouse) ───────────────────────────────
    ctx.fillStyle = muted;
    ctx.font = '9px Arial,Helvetica,sans-serif';
    ctx.fillText('COUNTING JOURNAL', margin, y);
    ctx.fillStyle = dark;
    ctx.font = 'bold 15px Arial,Helvetica,sans-serif';
    const journalLine = data.warehouseId
      ? `${data.journalNumber}  ·  ${data.warehouseId}`
      : data.journalNumber;
    ctx.fillText(clamp(journalLine, 'bold 15px Arial,Helvetica,sans-serif', contentW), margin, y + 17);
    y += 36;

    // ── Item ─────────────────────────────────────────────────
    ctx.fillStyle = muted;
    ctx.font = '9px Arial,Helvetica,sans-serif';
    ctx.fillText('ITEM', margin, y);
    ctx.fillStyle = dark;
    ctx.font = 'bold 20px Arial,Helvetica,sans-serif';
    ctx.fillText(clamp(data.itemNumber, 'bold 20px Arial,Helvetica,sans-serif', contentW), margin, y + 20);
    y += 24;
    if (data.productName) {
      ctx.fillStyle = muted;
      ctx.font = '11px Arial,Helvetica,sans-serif';
      ctx.fillText(clamp(data.productName, '11px Arial,Helvetica,sans-serif', contentW), margin, y + 10);
      y += 16;
    }
    y += 8;

    // ── Counted quantity ─────────────────────────────────────
    ctx.fillStyle = muted;
    ctx.font = '9px Arial,Helvetica,sans-serif';
    ctx.fillText('COUNTED QTY', margin, y);
    ctx.fillStyle = orange;
    ctx.font = 'bold 22px Arial,Helvetica,sans-serif';
    const qtyStr = `${Number(data.qty).toLocaleString('en-US', { maximumFractionDigits: 3 })}${data.unit ? ' ' + data.unit : ''}`;
    ctx.fillText(qtyStr, margin, y + 22);

    // ── Barcode (encodes the item number) ───────────────────
    const barcodeHeight = 40;
    const barcodeY = H - 68;
    this.drawBarcode(ctx, data.itemNumber, margin, barcodeY, contentW, barcodeHeight);

    ctx.textAlign = 'center';
    ctx.fillStyle = dark;
    ctx.font = '10px Arial,Helvetica,sans-serif';
    ctx.fillText(data.itemNumber, W / 2, barcodeY + barcodeHeight + 13);
    ctx.textAlign = 'left';

    // ── Footer ────────────────────────────────────────────────
    ctx.fillStyle = muted;
    ctx.font = '8px Arial,Helvetica,sans-serif';
    ctx.fillText(`Journal ${data.journalNumber}`, margin, H - 8);
    ctx.textAlign = 'right';
    ctx.fillText(
      data.countDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      W - margin,
      H - 8
    );
    ctx.textAlign = 'left';
  }

  // ── Finished Goods Label (one per reported production order, with a Code 128 barcode) ──

  /** Renders the label to a data URL so it can be shown on-screen before the user downloads or shares it. */
  getFinishedGoodsLabelPreviewDataUrl(data: FinishedGoodsLabelData): string {
    return this.renderFinishedGoodsLabelToCanvas(data).toDataURL('image/png');
  }

  async downloadFinishedGoodsLabel(data: FinishedGoodsLabelData): Promise<string | null> {
    const blob = await this.generateFinishedGoodsLabelPdf(data);
    return this.savePdf(blob, `label-${data.itemNumber}-${data.journalNumber}.pdf`);
  }

  async shareFinishedGoodsLabel(data: FinishedGoodsLabelData): Promise<void> {
    const blob = await this.generateFinishedGoodsLabelPdf(data);
    await this.sharePdfBlob(blob, `label-${data.itemNumber}-${data.journalNumber}.pdf`);
  }

  private async generateFinishedGoodsLabelPdf(data: FinishedGoodsLabelData): Promise<Blob> {
    const canvas = this.renderFinishedGoodsLabelToCanvas(data);
    const jpegBytes = await this.canvasToJpeg(canvas);
    return this.buildPdf(jpegBytes, canvas.width, canvas.height);
  }

  private renderFinishedGoodsLabelToCanvas(data: FinishedGoodsLabelData): HTMLCanvasElement {
    const W = 400;
    const H = 260;
    const S = 3; // extra scale — keeps the barcode bars crisp at print resolution
    const canvas = document.createElement('canvas');
    canvas.width = W * S;
    canvas.height = H * S;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.scale(S, S);
    this.drawFinishedGoodsLabel(ctx, data, W, H);
    return canvas;
  }

  private drawFinishedGoodsLabel(ctx: CanvasRenderingContext2D, data: FinishedGoodsLabelData, W: number, H: number): void {
    const margin = 16;
    const navy = '#002559';
    const orange = '#F24C1A';
    const dark = '#121c30';
    const muted = '#5b6478';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#d8dce6';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

    // ── Header ─────────────────────────────────────────────
    ctx.fillStyle = navy;
    ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial,Helvetica,sans-serif';
    ctx.fillText('GROW PATH', margin, 22);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '10px Arial,Helvetica,sans-serif';
    ctx.fillText('FINISHED GOODS LABEL', W - margin, 22);
    ctx.textAlign = 'left';

    ctx.fillStyle = orange;
    ctx.fillRect(0, 34, W, 3);

    const contentW = W - margin * 2;
    const clamp = (text: string, font: string, maxW: number): string => {
      ctx.font = font;
      if (ctx.measureText(text).width <= maxW) return text;
      let t = text;
      while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
      return t + '…';
    };

    let y = 56;

    // ── Production order ────────────────────────────────────
    ctx.fillStyle = muted;
    ctx.font = '9px Arial,Helvetica,sans-serif';
    ctx.fillText('PRODUCTION ORDER', margin, y);
    ctx.fillStyle = dark;
    ctx.font = 'bold 15px Arial,Helvetica,sans-serif';
    ctx.fillText(clamp(data.productionOrderNumber, 'bold 15px Arial,Helvetica,sans-serif', contentW), margin, y + 17);
    y += 36;

    // ── Item ─────────────────────────────────────────────────
    ctx.fillStyle = muted;
    ctx.font = '9px Arial,Helvetica,sans-serif';
    ctx.fillText('ITEM', margin, y);
    ctx.fillStyle = dark;
    ctx.font = 'bold 20px Arial,Helvetica,sans-serif';
    ctx.fillText(clamp(data.itemNumber, 'bold 20px Arial,Helvetica,sans-serif', contentW), margin, y + 20);
    y += 24;
    if (data.productName) {
      ctx.fillStyle = muted;
      ctx.font = '11px Arial,Helvetica,sans-serif';
      ctx.fillText(clamp(data.productName, '11px Arial,Helvetica,sans-serif', contentW), margin, y + 10);
      y += 16;
    }
    y += 8;

    // ── Quantity finished ────────────────────────────────────
    ctx.fillStyle = muted;
    ctx.font = '9px Arial,Helvetica,sans-serif';
    ctx.fillText('QTY FINISHED', margin, y);
    ctx.fillStyle = orange;
    ctx.font = 'bold 22px Arial,Helvetica,sans-serif';
    const qtyStr = `${Number(data.qty).toLocaleString('en-US', { maximumFractionDigits: 3 })}${data.unit ? ' ' + data.unit : ''}`;
    ctx.fillText(qtyStr, margin, y + 22);

    // ── Barcode (encodes the item number) ───────────────────
    const barcodeHeight = 40;
    const barcodeY = H - 68;
    this.drawBarcode(ctx, data.itemNumber, margin, barcodeY, contentW, barcodeHeight);

    ctx.textAlign = 'center';
    ctx.fillStyle = dark;
    ctx.font = '10px Arial,Helvetica,sans-serif';
    ctx.fillText(data.itemNumber, W / 2, barcodeY + barcodeHeight + 13);
    ctx.textAlign = 'left';

    // ── Footer ────────────────────────────────────────────────
    ctx.fillStyle = muted;
    ctx.font = '8px Arial,Helvetica,sans-serif';
    ctx.fillText(data.journalNumber ? `Journal ${data.journalNumber}` : 'Journal —', margin, H - 8);
    ctx.textAlign = 'right';
    ctx.fillText(
      data.reportDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      W - margin,
      H - 8
    );
    ctx.textAlign = 'left';
  }

  // ── Van Sale Label (one per completed sale, with a Code 128 barcode) ──

  /** Renders the label to a data URL so it can be shown on-screen before the driver prints it. */
  getVanSaleLabelPreviewDataUrl(data: VanSaleLabelData): string {
    return this.renderVanSaleLabelToCanvas(data).toDataURL('image/png');
  }

  async downloadVanSaleLabel(data: VanSaleLabelData): Promise<string | null> {
    const blob = await this.generateVanSaleLabelPdf(data);
    return this.savePdf(blob, `van-sale-${data.orderNumber}.pdf`);
  }

  async shareVanSaleLabel(data: VanSaleLabelData): Promise<void> {
    const blob = await this.generateVanSaleLabelPdf(data);
    await this.sharePdfBlob(blob, `van-sale-${data.orderNumber}.pdf`);
  }

  private async generateVanSaleLabelPdf(data: VanSaleLabelData): Promise<Blob> {
    const canvas = this.renderVanSaleLabelToCanvas(data);
    const jpegBytes = await this.canvasToJpeg(canvas);
    return this.buildPdf(jpegBytes, canvas.width, canvas.height);
  }

  /** Height grows with the line count, so a ten-item sale isn't clipped. */
  private renderVanSaleLabelToCanvas(data: VanSaleLabelData): HTMLCanvasElement {
    const W = 400;
    const rowH = 20;
    const listed = Math.min(data.lines.length, VAN_LABEL_MAX_LINES);
    const overflow = data.lines.length - listed;
    const H = 232 + listed * rowH + (overflow > 0 ? 16 : 0);
    const S = 3; // extra scale — keeps the barcode bars crisp at print resolution

    const canvas = document.createElement('canvas');
    canvas.width = W * S;
    canvas.height = H * S;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.scale(S, S);
    this.drawVanSaleLabel(ctx, data, W, H, rowH, listed, overflow);
    return canvas;
  }

  private drawVanSaleLabel(
    ctx: CanvasRenderingContext2D,
    data: VanSaleLabelData,
    W: number,
    H: number,
    rowH: number,
    listed: number,
    overflow: number
  ): void {
    const margin = 16;
    const navy = '#002559';
    const orange = '#F24C1A';
    const dark = '#121c30';
    const muted = '#5b6478';
    const contentW = W - margin * 2;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#d8dce6';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

    const clamp = (text: string, font: string, maxW: number): string => {
      ctx.font = font;
      if (ctx.measureText(text).width <= maxW) return text;
      let t = text;
      while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
      return t + '…';
    };
    const money = (n: number) =>
      n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // ── Header ─────────────────────────────────────────────
    ctx.fillStyle = navy;
    ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial,Helvetica,sans-serif';
    ctx.fillText('GROW PATH', margin, 22);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '10px Arial,Helvetica,sans-serif';
    ctx.fillText('VAN SALE', W - margin, 22);
    ctx.textAlign = 'left';

    ctx.fillStyle = orange;
    ctx.fillRect(0, 34, W, 3);

    let y = 56;

    // ── Order ───────────────────────────────────────────────
    ctx.fillStyle = muted;
    ctx.font = '9px Arial,Helvetica,sans-serif';
    ctx.fillText('SALES ORDER', margin, y);
    ctx.fillStyle = dark;
    ctx.font = 'bold 19px Arial,Helvetica,sans-serif';
    ctx.fillText(clamp(data.orderNumber, 'bold 19px Arial,Helvetica,sans-serif', contentW), margin, y + 19);
    y += 38;

    // ── Customer + van ──────────────────────────────────────
    const colW = contentW / 2 - 6;
    ctx.fillStyle = muted;
    ctx.font = '9px Arial,Helvetica,sans-serif';
    ctx.fillText('CUSTOMER', margin, y);
    ctx.fillText('ISSUED FROM', margin + colW + 12, y);

    ctx.fillStyle = dark;
    ctx.font = 'bold 12px Arial,Helvetica,sans-serif';
    ctx.fillText(
      clamp(data.customerName || data.customerAccount, 'bold 12px Arial,Helvetica,sans-serif', colW),
      margin,
      y + 14
    );
    const location = [data.siteId, data.warehouseId].filter(Boolean).join(' · ') || '—';
    ctx.fillText(clamp(location, 'bold 12px Arial,Helvetica,sans-serif', colW), margin + colW + 12, y + 14);

    ctx.fillStyle = muted;
    ctx.font = '9px Arial,Helvetica,sans-serif';
    ctx.fillText(clamp(data.customerAccount, '9px Arial,Helvetica,sans-serif', colW), margin, y + 25);
    y += 40;

    // ── Line items ──────────────────────────────────────────
    ctx.strokeStyle = '#e2e6ee';
    ctx.beginPath();
    ctx.moveTo(margin, y - 6);
    ctx.lineTo(W - margin, y - 6);
    ctx.stroke();

    ctx.fillStyle = muted;
    ctx.font = 'bold 8px Arial,Helvetica,sans-serif';
    ctx.fillText('ITEM', margin, y + 5);
    ctx.textAlign = 'center';
    ctx.fillText('QTY', W - margin - 74, y + 5);
    ctx.textAlign = 'right';
    ctx.fillText('AMOUNT', W - margin, y + 5);
    ctx.textAlign = 'left';
    y += 14;

    for (let i = 0; i < listed; i++) {
      const line = data.lines[i];
      const nameW = contentW - 150;

      ctx.fillStyle = dark;
      ctx.font = 'bold 10px Arial,Helvetica,sans-serif';
      ctx.fillText(clamp(line.itemNumber, 'bold 10px Arial,Helvetica,sans-serif', nameW), margin, y + 8);
      ctx.fillStyle = muted;
      ctx.font = '8.5px Arial,Helvetica,sans-serif';
      ctx.fillText(clamp(line.name, '8.5px Arial,Helvetica,sans-serif', nameW), margin, y + 17);

      ctx.fillStyle = dark;
      ctx.font = 'bold 11px Arial,Helvetica,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${line.qty}${line.unit ? ' ' + line.unit : ''}`, W - margin - 74, y + 12);
      ctx.textAlign = 'right';
      ctx.fillText(money(line.qty * line.price), W - margin, y + 12);
      ctx.textAlign = 'left';

      y += rowH;
    }

    if (overflow > 0) {
      ctx.fillStyle = muted;
      ctx.font = 'italic 9px Arial,Helvetica,sans-serif';
      ctx.fillText(`+ ${overflow} more item${overflow === 1 ? '' : 's'} on the order`, margin, y + 8);
      y += 16;
    }

    // ── Total ───────────────────────────────────────────────
    ctx.strokeStyle = '#c9cfdb';
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(W - margin, y);
    ctx.stroke();
    y += 6;

    ctx.fillStyle = muted;
    ctx.font = '9px Arial,Helvetica,sans-serif';
    ctx.fillText(`TOTAL · ${data.totalQty} unit${data.totalQty === 1 ? '' : 's'}`, margin, y + 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = orange;
    ctx.font = 'bold 17px Arial,Helvetica,sans-serif';
    ctx.fillText(`${money(data.totalAmount)} ${data.currencyCode}`, W - margin, y + 14);
    ctx.textAlign = 'left';

    // ── Barcode (encodes the order number) ──────────────────
    const barcodeHeight = 38;
    const barcodeY = H - 64;
    this.drawBarcode(ctx, data.orderNumber, margin, barcodeY, contentW, barcodeHeight);

    ctx.textAlign = 'center';
    ctx.fillStyle = dark;
    ctx.font = '10px Arial,Helvetica,sans-serif';
    ctx.fillText(data.orderNumber, W / 2, barcodeY + barcodeHeight + 12);
    ctx.textAlign = 'left';

    // ── Footer ──────────────────────────────────────────────
    ctx.fillStyle = muted;
    ctx.font = '8px Arial,Helvetica,sans-serif';
    ctx.fillText('Van sale', margin, H - 8);
    ctx.textAlign = 'right';
    ctx.fillText(
      data.soldAt.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      W - margin,
      H - 8
    );
    ctx.textAlign = 'left';
  }

  // ── Code 128 (Subset B) barcode renderer ────────────────────
  // Standard ISO/IEC 15417 pattern table: widths (in modules) of the 6 bar/space
  // elements for symbol values 0–102, then Start A/B/C (103–105) and Stop (106,
  // a 7-element pattern). Subset B covers ASCII 32–126, which is every character
  // item numbers use (digits, letters, hyphens).
  private readonly CODE128_PATTERNS: string[] = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
  ];

  private encodeCode128B(text: string): number[] {
    const START_B = 104;
    const values = [START_B];
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      // Subset B only covers ASCII 32–126 — anything else falls back to '?' rather
      // than producing an invalid symbol.
      const safeCode = code >= 32 && code <= 126 ? code : 63;
      values.push(safeCode - 32);
    }
    let checksum = values[0];
    for (let i = 1; i < values.length; i++) {
      checksum += values[i] * i;
    }
    values.push(checksum % 103);
    values.push(106); // Stop
    return values;
  }

  private drawBarcode(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    height: number
  ): void {
    const values = this.encodeCode128B(text);
    const widthsSeq: number[] = [];
    for (const v of values) {
      for (const ch of this.CODE128_PATTERNS[v]) widthsSeq.push(Number(ch));
    }

    const totalModules = widthsSeq.reduce((sum, w) => sum + w, 0);
    const moduleWidth = maxWidth / totalModules;
    const barcodeWidth = moduleWidth * totalModules;
    let cursor = x + (maxWidth - barcodeWidth) / 2;

    ctx.fillStyle = '#000000';
    let isBar = true;
    for (const w of widthsSeq) {
      const barWidth = w * moduleWidth;
      if (isBar) ctx.fillRect(cursor, y, barWidth, height);
      cursor += barWidth;
      isBar = !isBar;
    }
  }

  // ── JPEG + minimal PDF builder ─────────────────────────────

  private canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (!blob) { reject(new Error('toBlob failed')); return; }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      }, 'image/jpeg', 0.92);
    });
  }

  private buildPdf(jpegBytes: Uint8Array, imgW: number, imgH: number): Blob {
    // A4 width in PDF points (72 dpi); height follows the image aspect ratio so
    // variable-length documents (e.g. packing slips with many lines) are not squashed.
    const pW = 595.28;
    const pH = +(pW * (imgH / imgW)).toFixed(2);
    const enc = (s: string) => new TextEncoder().encode(s);

    const parts: Uint8Array[] = [];
    const offsets = new Array<number>(6).fill(0);
    let pos = 0;

    const push = (b: Uint8Array) => { parts.push(b); pos += b.length; };
    const str  = (s: string) => push(enc(s));

    str('%PDF-1.4\n');

    offsets[1] = pos;
    str('1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n');

    offsets[2] = pos;
    str('2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n');

    offsets[3] = pos;
    str(
      `3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${pW} ${pH}]` +
      `/Contents 4 0 R/Resources<</XObject<</Im0 5 0 R>>>>>>\nendobj\n`
    );

    // Paint the image upright. A PDF image XObject already maps its top row to
    // the top of the unit square, so a positive scale places it right-side-up.
    const streamContent = `q ${pW} 0 0 ${pH} 0 0 cm /Im0 Do Q`;
    offsets[4] = pos;
    str(`4 0 obj\n<</Length ${enc(streamContent).length}>>\nstream\n${streamContent}\nendstream\nendobj\n`);

    offsets[5] = pos;
    str(
      `5 0 obj\n<</Type/XObject/Subtype/Image` +
      `/Width ${imgW}/Height ${imgH}/ColorSpace/DeviceRGB` +
      `/BitsPerComponent 8/Filter/DCTDecode/Length ${jpegBytes.length}>>\nstream\n`
    );
    push(jpegBytes);
    str('\nendstream\nendobj\n');

    // xref: each entry is exactly 20 bytes  (10 offset + sp + 5 gen + sp + f/n + sp + \n)
    const xrefPos = pos;
    const fmtEntry = (offset: number, free: boolean) =>
      `${String(offset).padStart(10, '0')} 00000 ${free ? 'f' : 'n'} \n`;
    const xrefBody =
      fmtEntry(0, true) +
      [1, 2, 3, 4, 5].map(i => fmtEntry(offsets[i], false)).join('');
    str(`xref\n0 6\n${xrefBody}trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF`);

    const total = parts.reduce((s, p) => s + p.length, 0);
    const buf = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { buf.set(p, off); off += p.length; }

    return new Blob([buf], { type: 'application/pdf' });
  }
}

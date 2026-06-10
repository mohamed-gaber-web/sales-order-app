import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

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

  async downloadReceipt(data: ReceiptPdfData): Promise<void> {
    const blob = await this.generatePdf(data);
    await this.savePdf(blob, `receipt-${data.packingSlipId}.pdf`);
  }

  async shareReceipt(data: ReceiptPdfData): Promise<void> {
    const blob = await this.generatePdf(data);
    await this.sharePdfBlob(blob, `receipt-${data.packingSlipId}.pdf`);
  }

  private async savePdf(blob: Blob, filename: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const base64 = await this.blobToBase64(blob);
      await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Documents });
    } else {
      this.triggerBrowserDownload(blob, filename);
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
    if (data.unitPrice !== undefined) {
      const priceStr = `${Number(data.unitPrice).toLocaleString('en-US', {
        minimumFractionDigits: 2
      })}${data.currency ? '  ' + data.currency : ''}`;
      field('Unit Price', priceStr, midX);
    }
    y += 32;

    // Total box
    if (data.unitPrice !== undefined) {
      const total = Number(data.receiptQty) * Number(data.unitPrice);
      const totalStr = `${total.toLocaleString('en-US', {
        minimumFractionDigits: 2
      })}${data.currency ? '  ' + data.currency : ''}`;
      ctx.fillStyle = navy;
      ctx.fillRect(margin, y, contentW, 58);
      ctx.fillStyle = lightBlue;
      ctx.font = '10px Arial,Helvetica,sans-serif';
      ctx.fillText('TOTAL AMOUNT', margin + 14, y + 18);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px Arial,Helvetica,sans-serif';
      ctx.fillText(totalStr, margin + 14, y + 42);
      y += 68;
    }

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

  async downloadPackingSlip(data: PackingSlipPdfData): Promise<void> {
    const blob = await this.generatePackingSlipPdf(data);
    await this.savePdf(blob, `packing-slip-${data.packingSlipId}.pdf`);
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

import { Injectable } from '@angular/core';

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

export interface PackingSlipPdfData {
  salesOrderId: string;
  packingSlipId: string;
  dataAreaId: string;
  customerAccount?: string;
  customerName?: string;
  warehouse?: string;
  slipDate: Date;
}

// No external dependencies — uses Canvas API + inline minimal PDF builder.
@Injectable({ providedIn: 'root' })
export class PdfService {

  async downloadReceipt(data: ReceiptPdfData): Promise<void> {
    const blob = await this.generatePdf(data);
    this.triggerDownload(blob, `receipt-${data.packingSlipId}.pdf`);
  }

  async shareReceipt(data: ReceiptPdfData): Promise<void> {
    const filename = `receipt-${data.packingSlipId}.pdf`;
    const blob = await this.generatePdf(data);
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
    } else {
      this.triggerDownload(blob, filename);
    }
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
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
    ctx.fillStyle = lightBlue;
    ctx.font = '11px Arial,Helvetica,sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Receipt ID    ${data.packingSlipId}`, W - margin, 36);
    ctx.fillText(`Date             ${dateStr}`, W - margin, 54);
    ctx.fillText(`Company      ${data.dataAreaId.toUpperCase()}`, W - margin, 72);
    ctx.textAlign = 'left';

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
    this.triggerDownload(blob, `packing-slip-${data.packingSlipId}.pdf`);
  }

  async sharePackingSlip(data: PackingSlipPdfData): Promise<void> {
    const filename = `packing-slip-${data.packingSlipId}.pdf`;
    const blob = await this.generatePackingSlipPdf(data);
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
    } else {
      this.triggerDownload(blob, filename);
    }
  }

  private async generatePackingSlipPdf(data: PackingSlipPdfData): Promise<Blob> {
    const canvas = this.renderPackingSlipToCanvas(data);
    const jpegBytes = await this.canvasToJpeg(canvas);
    return this.buildPdf(jpegBytes, canvas.width, canvas.height);
  }

  private renderPackingSlipToCanvas(data: PackingSlipPdfData): HTMLCanvasElement {
    const W = 595;
    const H = 842;
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
    ctx.fillStyle = lightBlue;
    ctx.font = '11px Arial,Helvetica,sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Packing Slip    ${data.packingSlipId}`, W - margin, 36);
    ctx.fillText(`Date               ${dateStr}`, W - margin, 54);
    ctx.fillText(`Company         ${data.dataAreaId.toUpperCase()}`, W - margin, 72);
    ctx.textAlign = 'left';

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
    // A4 in PDF points (72 dpi)
    const pW = 595.28;
    const pH = 841.89;
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

    // Flip image vertically: canvas (0,0) = top-left → PDF (0,0) = bottom-left
    const streamContent = `q ${pW} 0 0 -${pH} 0 ${pH} cm /Im0 Do Q`;
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

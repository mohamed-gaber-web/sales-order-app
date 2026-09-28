import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { VanDocument } from '../../../../core/van-sales';
import { isCancel } from './van-printer.service';
import { buildReceiptRows, ReceiptContext, ReceiptRow } from './van-receipt-layout';

/** Receipt width in CSS pixels before the retina scale — roughly an 80 mm roll. */
const W = 360;
const S = 2;
const PAD = 18;

/**
 * The receipt as a PDF, built the way `core/services/pdf.service.ts` builds
 * every other PDF in the app: draw on a canvas, encode JPEG, wrap it in a
 * one-page PDF by hand, then hand it to the share sheet (native) or the Web
 * Share API / a download (web).
 *
 * A canvas rather than a PDF text library because customer and product names
 * are often Arabic, and the canvas shapes Arabic text with the system font
 * where a PDF library's built-in fonts cannot.
 */
@Injectable({ providedIn: 'root' })
export class VanReceiptPdfService {
  async share(doc: VanDocument, ctx: ReceiptContext, qrDataUrl?: string | null): Promise<'SHARED' | 'DOWNLOADED' | 'CANCELLED'> {
    const blob = await this.build(doc, ctx, qrDataUrl);
    const filename = `${doc.id}.pdf`;
    try {
      if (Capacitor.isNativePlatform()) {
        const base64 = await blobToBase64(blob);
        const file = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
        await Share.share({ title: filename, url: file.uri });
        return 'SHARED';
      }
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return 'SHARED';
      }
    } catch (e) {
      if (isCancel(e)) return 'CANCELLED';
      throw e;
    }
    download(blob, filename);
    return 'DOWNLOADED';
  }

  async build(doc: VanDocument, ctx: ReceiptContext, qrDataUrl?: string | null): Promise<Blob> {
    const rows = buildReceiptRows(doc, ctx);
    const qr = qrDataUrl ? await loadImage(qrDataUrl) : null;
    const canvas = this.draw(rows, qr);
    const jpeg = await canvasToJpeg(canvas);
    return buildPdf(jpeg, canvas.width, canvas.height);
  }

  private draw(rows: ReceiptRow[], qr: HTMLImageElement | null): HTMLCanvasElement {
    const QR = 150;
    const height = PAD * 2 + rows.reduce((h, r) => h + rowHeight(r), 0) + (qr ? QR + 16 : 0);
    const canvas = document.createElement('canvas');
    canvas.width = W * S;
    canvas.height = Math.ceil(height * S);
    const g = canvas.getContext('2d');
    if (!g) throw new Error('Canvas not supported');
    g.scale(S, S);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, height);

    const font = (bold = false, size = 12) =>
      `${bold ? '700' : '400'} ${size}px system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Arabic', sans-serif`;
    const inner = W - PAD * 2;
    let y = PAD;

    for (const r of rows) {
      const h = rowHeight(r);
      const base = y + h - 5;
      g.textBaseline = 'alphabetic';
      switch (r.kind) {
        case 'rule':
          g.strokeStyle = '#c9ced8';
          g.setLineDash([3, 3]);
          g.beginPath();
          g.moveTo(PAD, y + h / 2);
          g.lineTo(W - PAD, y + h / 2);
          g.stroke();
          g.setLineDash([]);
          break;
        case 'gap':
          break;
        case 'center':
          g.font = font(r.bold, r.bold ? 14 : 12);
          g.fillStyle = r.bold ? '#002559' : '#121c30';
          g.textAlign = 'center';
          g.fillText(fit(g, r.text, inner), W / 2, base);
          break;
        case 'text':
          g.font = font(false, r.muted ? 11 : 12);
          g.fillStyle = r.muted ? '#6b7280' : '#121c30';
          g.textAlign = 'left';
          g.fillText(fit(g, r.text, inner), PAD, base);
          break;
        case 'pair': {
          g.font = font(r.bold, r.bold ? 14 : 12);
          g.fillStyle = '#121c30';
          g.textAlign = 'right';
          g.fillText(r.right, W - PAD, base);
          const rightW = g.measureText(r.right).width;
          g.textAlign = 'left';
          g.fillText(fit(g, r.left, inner - rightW - 8), PAD, base);
          break;
        }
      }
      y += h;
    }

    if (qr) {
      g.drawImage(qr, (W - QR) / 2, y + 8, QR, QR);
    }
    return canvas;
  }
}

function rowHeight(r: ReceiptRow): number {
  switch (r.kind) {
    case 'rule':
      return 12;
    case 'gap':
      return 8;
    case 'center':
      return r.bold ? 22 : 18;
    case 'pair':
      return r.bold ? 22 : 18;
    case 'text':
      return r.muted ? 16 : 18;
  }
}

/** Truncates with an ellipsis so a long name never runs into the amount. */
function fit(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('toBlob failed'));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      'image/jpeg',
      0.92
    );
  });
}

/** One page, one JPEG — the same minimal PDF `PdfService.buildPdf` writes. */
function buildPdf(jpeg: Uint8Array, imgW: number, imgH: number): Blob {
  const pW = 226.77; // 80 mm
  const pH = +(pW * (imgH / imgW)).toFixed(2);
  const enc = (s: string) => new TextEncoder().encode(s);
  const parts: Uint8Array[] = [];
  const offsets = new Array<number>(6).fill(0);
  let pos = 0;
  const push = (b: Uint8Array) => {
    parts.push(b);
    pos += b.length;
  };
  const str = (s: string) => push(enc(s));

  str('%PDF-1.4\n');
  offsets[1] = pos;
  str('1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n');
  offsets[2] = pos;
  str('2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n');
  offsets[3] = pos;
  str(`3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${pW} ${pH}]/Contents 4 0 R/Resources<</XObject<</Im0 5 0 R>>>>>>\nendobj\n`);
  const content = `q ${pW} 0 0 ${pH} 0 0 cm /Im0 Do Q`;
  offsets[4] = pos;
  str(`4 0 obj\n<</Length ${enc(content).length}>>\nstream\n${content}\nendstream\nendobj\n`);
  offsets[5] = pos;
  str(
    `5 0 obj\n<</Type/XObject/Subtype/Image/Width ${imgW}/Height ${imgH}/ColorSpace/DeviceRGB` +
      `/BitsPerComponent 8/Filter/DCTDecode/Length ${jpeg.length}>>\nstream\n`
  );
  push(jpeg);
  str('\nendstream\nendobj\n');

  const xrefPos = pos;
  const entry = (offset: number, free: boolean) => `${String(offset).padStart(10, '0')} 00000 ${free ? 'f' : 'n'} \n`;
  const xref = entry(0, true) + [1, 2, 3, 4, 5].map((i) => entry(offsets[i], false)).join('');
  str(`xref\n0 6\n${xref}trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF`);

  const buf = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let off = 0;
  for (const p of parts) {
    buf.set(p, off);
    off += p.length;
  }
  return new Blob([buf], { type: 'application/pdf' });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

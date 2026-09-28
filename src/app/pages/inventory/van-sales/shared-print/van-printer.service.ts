import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { VanDocument } from '../../../../core/van-sales';
import { buildReceiptRows, ReceiptContext, renderReceiptText } from './van-receipt-layout';

export type PrintOutcome = 'PRINTED' | 'SHARED' | 'DOWNLOADED' | 'CANCELLED';

/**
 * Thermal receipt printing (spec §7.8).
 *
 * The app ships no Bluetooth printer plugin yet, so `connected` is always
 * false and `print` falls back to handing the same fixed-width text to the
 * share sheet — the rep can send it to a printer app, WhatsApp or SMS. When a
 * plugin lands, `sendToPrinter` is the one place that changes; the text is
 * already laid out for 32 (58 mm) or 48 (80 mm) columns.
 */
@Injectable({ providedIn: 'root' })
export class VanPrinterService {
  readonly connected = signal(false);
  /** 58 mm paper by default — the common van printer. */
  readonly columns = signal<32 | 48>(32);

  text(doc: VanDocument, ctx: ReceiptContext): string {
    return renderReceiptText(buildReceiptRows(doc, ctx), this.columns());
  }

  async print(doc: VanDocument, ctx: ReceiptContext): Promise<PrintOutcome> {
    const text = this.text(doc, ctx);
    if (this.connected()) {
      await this.sendToPrinter(text);
      return 'PRINTED';
    }
    return this.shareText(`${doc.id}.txt`, text);
  }

  private async sendToPrinter(_text: string): Promise<void> {
    throw new Error('No printer plugin installed.');
  }

  private async shareText(filename: string, text: string): Promise<PrintOutcome> {
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: filename, text });
        return 'SHARED';
      }
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: filename, text });
        return 'SHARED';
      }
    } catch (e) {
      if (isCancel(e)) return 'CANCELLED';
      // Share sheet unavailable — fall through to a download.
    }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return 'DOWNLOADED';
  }
}

export function isCancel(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /abort|cancel/i.test(msg);
}

import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export interface ScanResult {
  rawValue: string;
  format: string;
}

// Extend Window type for BarcodeDetector (Chrome/Edge native API)
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string; format: string }>>;
    };
  }
}

@Injectable({ providedIn: 'root' })
export class BarcodeScannerService {
  readonly isNativeApiSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  /** Returns true if the browser can scan without a plugin */
  get canScan(): boolean {
    return this.isNativeApiSupported;
  }

  /**
   * Detect barcodes in a video element frame using the native BarcodeDetector API.
   * Returns null if the API is not available or no barcode found.
   */
  async detectFromVideo(video: HTMLVideoElement): Promise<ScanResult | null> {
    if (!this.isNativeApiSupported || !window.BarcodeDetector) return null;
    try {
      const detector = new window.BarcodeDetector({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'data_matrix', 'pdf417'],
      });
      const barcodes = await detector.detect(video);
      if (barcodes.length > 0) {
        return { rawValue: barcodes[0].rawValue, format: barcodes[0].format };
      }
    } catch {
      // BarcodeDetector may throw on some platforms
    }
    return null;
  }

  /**
   * Guess what an inventory page to route to based on scanned value.
   * Returns a router URL string.
   */
  resolveRoute(value: string): string {
    const v = value.trim().toUpperCase();
    // PO numbers
    if (/^(PO|00\d{6,})/.test(v)) return `/purchase-order/detail/${value.trim()}`;
    // Transfer orders
    if (/^TO|^T-/.test(v)) return `/transfer-order/detail/${value.trim()}`;
    // Inventory (item number) — fall through to on-hand
    return `/inventory/on-hand`;
  }
}

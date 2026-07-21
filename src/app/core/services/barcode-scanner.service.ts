import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import {
  BarcodeScanner,
  BarcodeFormat,
} from '@capacitor-mlkit/barcode-scanning';

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

const SCAN_FORMATS = [
  BarcodeFormat.QrCode,
  BarcodeFormat.Code128,
  BarcodeFormat.Code39,
  BarcodeFormat.Ean13,
  BarcodeFormat.Ean8,
  BarcodeFormat.DataMatrix,
  BarcodeFormat.Pdf417,
];

@Injectable({ providedIn: 'root' })
export class BarcodeScannerService {
  readonly isNativeApiSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  constructor(private platform: Platform) {}

  get isNative(): boolean {
    return this.platform.is('capacitor') || this.platform.is('cordova');
  }

  /** Returns true if this device/browser can scan without falling back to manual entry */
  get canScan(): boolean {
    return this.isNative || this.isNativeApiSupported;
  }

  /**
   * Native (ML Kit) scan — opens the device's full-screen barcode scanner.
   * Returns null if the user cancels without scanning anything.
   */
  async scanNative(): Promise<ScanResult | null> {
    const { camera } = await BarcodeScanner.checkPermissions();
    if (camera !== 'granted' && camera !== 'limited') {
      const requested = await BarcodeScanner.requestPermissions();
      if (requested.camera !== 'granted' && requested.camera !== 'limited') {
        throw new Error('Camera permission denied');
      }
    }

    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      await BarcodeScanner.installGoogleBarcodeScannerModule();
      throw new Error('Downloading the scanner module. Try again in a moment.');
    }

    const { barcodes } = await BarcodeScanner.scan({ formats: SCAN_FORMATS });
    const [first] = barcodes;
    if (first?.rawValue) {
      return { rawValue: first.rawValue, format: first.format };
    }
    return null;
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

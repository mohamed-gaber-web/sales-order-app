import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  NgZone,
} from '@angular/core';
import { ModalController } from '@ionic/angular';
import { BarcodeScannerService, ScanResult } from '../../../core/services/barcode-scanner.service';

@Component({
  selector: 'app-scanner-modal',
  templateUrl: './scanner-modal.component.html',
  styleUrls: ['./scanner-modal.component.scss'],
  standalone: false,
})
export class ScannerModalComponent implements OnInit, OnDestroy {
  @ViewChild('videoEl') videoRef!: ElementRef<HTMLVideoElement>;

  manualValue = '';
  isScanning = false;
  scanError = '';
  lastResult: ScanResult | null = null;
  readonly canScan: boolean;

  private stream: MediaStream | null = null;
  private rafId: number | null = null;

  constructor(
    private modalCtrl: ModalController,
    private scannerService: BarcodeScannerService,
    private zone: NgZone,
  ) {
    this.canScan = this.scannerService.canScan;
  }

  ngOnInit() {
    if (this.canScan) {
      // slight delay to let the modal render the video element
      setTimeout(() => this.startCamera(), 300);
    }
  }

  async startCamera() {
    this.scanError = '';
    this.isScanning = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const video = this.videoRef?.nativeElement;
      if (video) {
        video.srcObject = this.stream;
        await video.play();
        this.scheduleScan(video);
      }
    } catch {
      this.isScanning = false;
      this.scanError = 'Camera access denied. Use manual entry below.';
    }
  }

  private scheduleScan(video: HTMLVideoElement) {
    const scan = async () => {
      if (!this.isScanning) return;
      const result = await this.scannerService.detectFromVideo(video);
      if (result) {
        this.zone.run(() => this.onScanSuccess(result));
        return;
      }
      this.rafId = requestAnimationFrame(scan);
    };
    this.rafId = requestAnimationFrame(scan);
  }

  private onScanSuccess(result: ScanResult) {
    this.stopCamera();
    this.lastResult = result;
    this.dismiss(result.rawValue);
  }

  submitManual() {
    const v = this.manualValue.trim();
    if (!v) return;
    this.dismiss(v);
  }

  dismiss(value?: string) {
    this.stopCamera();
    this.modalCtrl.dismiss(value ?? null);
  }

  private stopCamera() {
    this.isScanning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  ngOnDestroy() {
    this.stopCamera();
  }
}

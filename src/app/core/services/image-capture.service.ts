import { Injectable, inject } from '@angular/core';
import { Platform } from '@ionic/angular';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { CapturedImage, CaptureSource } from '../../models/po-document-scan.model';

/**
 * Longest edge of the uploaded image. Claude reads up to 2576px, but paper
 * paperwork is legible well below that and a smaller upload is the difference
 * between a snappy scan and a stalled one on warehouse wifi.
 */
const MAX_EDGE_PX = 2000;

/** JPEG quality after downscaling — high enough to keep small print sharp. */
const JPEG_QUALITY = 0.85;

const OUTPUT_MEDIA_TYPE = 'image/jpeg';

/**
 * Captures a document photo and normalises it for upload.
 *
 * Native uses the Capacitor camera. Web uses a file input, because the camera
 * plugin needs @ionic/pwa-elements in the browser and a plain input already
 * opens the rear camera on mobile browsers.
 *
 * Everything is re-encoded through a canvas, so HEIC, PNG and oversized phone
 * photos all arrive as a bounded JPEG.
 */
@Injectable({ providedIn: 'root' })
export class ImageCaptureService {
  private readonly platform = inject(Platform);

  private get isNative(): boolean {
    return this.platform.is('capacitor') || this.platform.is('cordova');
  }

  /** Resolves to null when the user backs out of the picker. */
  async capture(source: CaptureSource): Promise<CapturedImage | null> {
    const rawDataUrl = this.isNative
      ? await this.captureNative(source)
      : await this.captureWeb(source);

    if (!rawDataUrl) return null;

    const previewDataUrl = await this.downscale(rawDataUrl);
    return {
      previewDataUrl,
      mediaType: OUTPUT_MEDIA_TYPE,
      base64: previewDataUrl.slice(previewDataUrl.indexOf(',') + 1),
    };
  }

  private async captureNative(source: CaptureSource): Promise<string | null> {
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        correctOrientation: true,
        resultType: CameraResultType.DataUrl,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      });
      return photo.dataUrl ?? null;
    } catch {
      // getPhoto rejects when the user cancels, which is not an error path.
      return null;
    }
  }

  private captureWeb(source: CaptureSource): Promise<string | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      if (source === 'camera') {
        input.setAttribute('capture', 'environment');
      }
      input.style.display = 'none';

      // The file dialog fires no event on cancel, so the element is cleaned up
      // when a file arrives and left to the next capture otherwise.
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });

      document.body.appendChild(input);
      input.click();
    });
  }

  private downscale(dataUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => {
        const longestEdge = Math.max(image.width, image.height);
        const scale = longestEdge > MAX_EDGE_PX ? MAX_EDGE_PX / longestEdge : 1;

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('This device cannot process the photo.'));
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(OUTPUT_MEDIA_TYPE, JPEG_QUALITY));
      };

      image.onerror = () => reject(new Error('That file is not a readable image.'));
      image.src = dataUrl;
    });
  }
}

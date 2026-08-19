import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, TimeoutError, catchError, throwError, timeout } from 'rxjs';
import { ApiService } from './api.service';
import { CapturedImage, ScannedPurchaseOrder } from '../../models/po-document-scan.model';
import { RuntimeConfigService } from '../config/runtime-config.service';

const OCR_PATH = '/api/ocr';

/**
 * Reading a photographed document runs a vision model at high effort, which is
 * slow by design — long enough to let a busy call finish, short enough that the
 * loading spinner doesn't hang forever.
 */
const OCR_TIMEOUT_MS = 120_000;

/** Carries a message that is already safe to show the user. */
export class DocumentOcrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentOcrError';
  }
}

/**
 * Speaks to the /api/ocr endpoint, which holds the Anthropic key server-side.
 *
 * Web (dev and Vercel) hits the relative path and lets the proxy route it.
 * Native has no proxy, so it needs the deployed origin in
 * `RuntimeConfigService.ocrApiBaseUrl`.
 */
@Injectable({ providedIn: 'root' })
export class DocumentOcrService {
  private readonly api = inject(ApiService);
  private readonly config = inject(RuntimeConfigService);

  extractPurchaseOrder(image: CapturedImage): Observable<ScannedPurchaseOrder> {
    const baseUrl = this.api.isNative ? this.config.ocrApiBaseUrl : '';

    if (this.api.isNative && !baseUrl) {
      return throwError(
        () =>
          new DocumentOcrError(
            'Document scanning is not set up for the mobile app yet. Set ocrApiBaseUrl in the environment file.'
          )
      );
    }

    return this.api
      .postWithHeaders<ScannedPurchaseOrder>(
        OCR_PATH,
        { image: image.base64, mediaType: image.mediaType },
        {},
        baseUrl
      )
      .pipe(
        timeout(OCR_TIMEOUT_MS),
        catchError((err: unknown) => throwError(() => this.toDisplayError(err)))
      );
  }

  private toDisplayError(err: unknown): DocumentOcrError {
    if (err instanceof TimeoutError) {
      return new DocumentOcrError('Reading the document took too long. Try again on a stronger connection.');
    }

    if (err instanceof HttpErrorResponse) {
      // /api/ocr already returns client-safe copy in `error`.
      const serverMessage = typeof err.error?.error === 'string' ? err.error.error.trim() : '';
      if (serverMessage) return new DocumentOcrError(serverMessage);

      if (err.status === 0) {
        return new DocumentOcrError('Could not reach the document reader. Check your connection.');
      }
    }

    return new DocumentOcrError('Could not read this document. Try again.');
  }
}

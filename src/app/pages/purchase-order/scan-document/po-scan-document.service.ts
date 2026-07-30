import { Injectable, computed, inject, signal } from '@angular/core';
import { TimeoutError, firstValueFrom } from 'rxjs';
import { DocumentOcrError, DocumentOcrService } from '../../../core/services/document-ocr.service';
import { ImageCaptureService } from '../../../core/services/image-capture.service';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { PurchaseOrderHeader, PurchaseOrderLine } from '../../../models/purchase-order.model';
import {
  CaptureSource,
  CapturedImage,
  ConfirmedScanReceipt,
  ScanActionResult,
  ScanMatchRow,
  ScanStage,
  ScannedOrderLine,
  ScannedPurchaseOrder,
} from '../../../models/po-document-scan.model';

/** Quantities are carried to three decimals everywhere else in the receipt flow. */
const QTY_PRECISION = 1000;

/**
 * Below this length a description is too generic to match on safely — "BOLT"
 * would claim the wrong line.
 */
const MIN_DESCRIPTION_MATCH_LENGTH = 6;

/**
 * Owns the paper-scan flow: photo → extraction → reconciliation against the live
 * order → posted product receipt.
 *
 * Provided by the page module, so the flow resets with the feature rather than
 * living for the app's lifetime.
 */
@Injectable()
export class PoScanDocumentService {
  private readonly capture = inject(ImageCaptureService);
  private readonly ocr = inject(DocumentOcrService);
  private readonly poService = inject(PurchaseOrderService);

  private readonly _stage = signal<ScanStage>('capture');
  private readonly _image = signal<CapturedImage | null>(null);
  private readonly _extraction = signal<ScannedPurchaseOrder | null>(null);
  private readonly _poNumber = signal('');
  private readonly _order = signal<PurchaseOrderHeader | null>(null);
  private readonly _rows = signal<ScanMatchRow[]>([]);
  private readonly _confirmed = signal<ConfirmedScanReceipt | null>(null);

  readonly stage = this._stage.asReadonly();
  readonly image = this._image.asReadonly();
  readonly extraction = this._extraction.asReadonly();
  readonly poNumber = this._poNumber.asReadonly();
  readonly order = this._order.asReadonly();
  readonly rows = this._rows.asReadonly();
  readonly confirmed = this._confirmed.asReadonly();

  readonly isBusy = computed(() => {
    const stage = this._stage();
    return stage === 'extracting' || stage === 'matching' || stage === 'submitting';
  });

  /** The footer CTA only exists for the two stages that have an action to take. */
  readonly showCta = computed(() => {
    const stage = this._stage();
    return stage === 'review' || stage === 'matching' || stage === 'receipt' || stage === 'submitting';
  });

  readonly selectedRows = computed(() => this._rows().filter((row) => row.include));

  readonly totalQty = computed(() =>
    this.round(this.selectedRows().reduce((sum, row) => sum + row.qty, 0))
  );

  readonly canSubmit = computed(
    () =>
      this.selectedRows().length > 0 &&
      this.selectedRows().every((row) => this.isRowQtyValid(row))
  );

  /** Lines still open on the order that the scanned document did not mention. */
  readonly unscannedOrderLines = computed<PurchaseOrderLine[]>(() => {
    const claimed = new Set(
      this._rows()
        .map((row) => row.poLine?.LineNumber)
        .filter((lineNumber): lineNumber is number => lineNumber !== undefined)
    );
    return (this._order()?.PurchaseOrderLinesV2 ?? []).filter(
      (line) => !claimed.has(line.LineNumber) && this.remainingOf(line) > 0
    );
  });

  isRowQtyValid(row: ScanMatchRow): boolean {
    return row.qty > 0 && row.qty <= row.remainingQty;
  }

  reset(): void {
    this._stage.set('capture');
    this._image.set(null);
    this._extraction.set(null);
    this._poNumber.set('');
    this._order.set(null);
    this._rows.set([]);
    this._confirmed.set(null);
  }

  // ── Step 1: photograph the document and read it ────────────
  async scanDocument(source: CaptureSource): Promise<ScanActionResult> {
    let captured: CapturedImage | null;
    try {
      captured = await this.capture.capture(source);
    } catch (err) {
      return { ok: false, message: this.messageOf(err, 'Could not use that photo. Try another one.') };
    }

    if (!captured) return { ok: true }; // user backed out of the picker

    this._image.set(captured);
    this._stage.set('extracting');

    try {
      const extraction = await firstValueFrom(this.ocr.extractPurchaseOrder(captured));
      this._extraction.set(extraction);
      this._poNumber.set(extraction.poNumber.trim());
      this._stage.set('review');
      return { ok: true };
    } catch (err) {
      this._stage.set('capture');
      this._image.set(null);
      return { ok: false, message: this.messageOf(err, 'Could not read this document. Try again.') };
    }
  }

  /** Stored verbatim so the field stays typeable; trimmed where it is used. */
  setPoNumber(value: string): void {
    this._poNumber.set(value);
  }

  // ── Step 2: reconcile against the live order ───────────────
  async matchToOrder(): Promise<ScanActionResult> {
    const poNumber = this._poNumber().trim();
    const extraction = this._extraction();

    if (!poNumber) {
      return { ok: false, message: 'Enter the purchase order number before matching.' };
    }
    if (!extraction) {
      return { ok: false, message: 'Scan a document first.' };
    }

    this._stage.set('matching');

    try {
      const order = await firstValueFrom(this.poService.getOrderWithLines(poNumber));
      this._poNumber.set(poNumber); // normalise the field to what actually resolved
      this._order.set(order);
      this._rows.set(this.buildRows(extraction.lines, order.PurchaseOrderLinesV2 ?? []));
      this._stage.set('receipt');
      return { ok: true };
    } catch (err) {
      this._stage.set('review');
      return {
        ok: false,
        message: this.messageOf(err, `Could not load purchase order ${poNumber}. Check the number and your connection.`),
      };
    }
  }

  /**
   * Kept unclamped while typing — clamping every keystroke fights the user.
   * `isRowQtyValid` drives the inline error, and `clampRowQty` settles it on blur.
   */
  /** Back to the extracted data, e.g. to correct the PO number and match again. */
  backToReview(): void {
    this._stage.set('review');
    this._order.set(null);
    this._rows.set([]);
  }

  setRowQty(index: number, qty: number): void {
    this.updateRow(index, (row) => ({ ...row, qty: this.round(Math.max(0, Number(qty) || 0)) }));
  }

  clampRowQty(index: number): void {
    this.updateRow(index, (row) => ({
      ...row,
      qty: this.round(Math.min(row.remainingQty, Math.max(0, Number(row.qty) || 0))),
    }));
  }

  adjustRowQty(index: number, delta: number): void {
    this.updateRow(index, (row) => {
      const next = Math.min(row.remainingQty, Math.max(0, row.qty + delta));
      return { ...row, qty: this.round(next) };
    });
  }

  useMaxQty(index: number): void {
    this.updateRow(index, (row) => ({ ...row, qty: row.remainingQty }));
  }

  toggleRow(index: number): void {
    this.updateRow(index, (row) =>
      // A row with no matching order line has nothing to receive against.
      row.status === 'matched' ? { ...row, include: !row.include } : row
    );
  }

  /** Adds an open order line the document never mentioned. */
  addOrderLine(line: PurchaseOrderLine): void {
    const remainingQty = this.remainingOf(line);
    if (remainingQty <= 0) return;

    const scanned: ScannedOrderLine = {
      lineNumber: line.LineNumber,
      itemNumber: line.ItemNumber,
      description: line.ProductName ?? '',
      quantity: remainingQty,
      unit: line.PurchaseUnitSymbol ?? '',
      unitPrice: 0,
    };

    this._rows.update((rows) => [
      ...rows,
      { scanned, poLine: line, status: 'matched', remainingQty, qty: remainingQty, include: true },
    ]);
  }

  // ── Step 3: post the receipt ───────────────────────────────
  async submitReceipt(): Promise<ScanActionResult> {
    const order = this._order();
    const rows = this.selectedRows();

    if (!order || rows.length === 0) {
      return { ok: false, message: 'Select at least one line to receive.' };
    }

    const poNumber = this._poNumber();
    const packingSlipId = `RCP-${poNumber}-${Date.now()}`;
    this._stage.set('submitting');

    try {
      const response = await firstValueFrom(
        this.poService.createProductReceipt({
          _request: {
            DataAreaId: ((order.dataAreaId as string) ?? 'usmf').toUpperCase(),
            purchaseOrderID: poNumber,
            productReceiptId: packingSlipId,
            purchaseLineNum: rows.map((row) => row.poLine?.LineNumber ?? 0),
            productReceiptQty: rows.map((row) => row.qty),
          },
        })
      );

      if (!response.Success) {
        this._stage.set('receipt');
        const serverMessage = (response.ErrorMessage || response.DebugMessage || '').trim();
        return { ok: false, message: serverMessage ? `Receipt failed: ${serverMessage}` : 'Receipt failed. Try again.' };
      }

      this._confirmed.set({
        poNumber,
        packingSlipId,
        totalQty: this.round(rows.reduce((sum, row) => sum + row.qty, 0)),
        lines: rows.map((row) => ({
          itemNumber: row.scanned.itemNumber || (row.poLine?.ItemNumber ?? ''),
          productName: row.poLine?.ProductName,
          qty: row.qty,
          unit: row.poLine?.PurchaseUnitSymbol,
        })),
      });
      this._stage.set('done');
      return { ok: true };
    } catch (err) {
      this._stage.set('receipt');
      if (err instanceof TimeoutError) {
        return {
          ok: false,
          message:
            'Taking longer than expected. This receipt may have already gone through — check the order before submitting again.',
        };
      }
      return { ok: false, message: this.messageOf(err, 'Receipt failed. Check your connection and try again.') };
    }
  }

  // ── Matching ───────────────────────────────────────────────
  private buildRows(scannedLines: ScannedOrderLine[], orderLines: PurchaseOrderLine[]): ScanMatchRow[] {
    const claimed = new Set<number>();

    return scannedLines.map((scanned) => {
      const poLine = this.findOrderLine(scanned, orderLines, claimed);
      if (poLine) claimed.add(poLine.LineNumber);

      const remainingQty = poLine ? this.remainingOf(poLine) : 0;
      const status: ScanMatchRow['status'] = !poLine
        ? 'not-on-order'
        : remainingQty > 0
          ? 'matched'
          : 'fully-received';

      const wanted = scanned.quantity > 0 ? scanned.quantity : remainingQty;
      const qty = this.round(Math.min(Math.max(0, wanted), remainingQty));

      return { scanned, poLine, status, remainingQty, qty, include: status === 'matched' && qty > 0 };
    });
  }

  /**
   * Item number first (exact, then ignoring punctuation), description only as a
   * last resort — a photographed code often loses a dash or a leading zero, but
   * a wrong match posts stock against the wrong line.
   */
  private findOrderLine(
    scanned: ScannedOrderLine,
    orderLines: PurchaseOrderLine[],
    claimed: Set<number>
  ): PurchaseOrderLine | null {
    const available = orderLines.filter((line) => !claimed.has(line.LineNumber));
    const itemNumber = this.normalise(scanned.itemNumber);

    if (itemNumber) {
      const exact = available.find((line) => this.normalise(line.ItemNumber) === itemNumber);
      if (exact) return exact;

      const loose = this.strip(itemNumber);
      if (loose) {
        const looseMatch = available.find((line) => this.strip(this.normalise(line.ItemNumber)) === loose);
        if (looseMatch) return looseMatch;
      }
    }

    const description = this.normalise(scanned.description);
    if (description.length >= MIN_DESCRIPTION_MATCH_LENGTH) {
      const byName = available.find((line) => {
        const productName = this.normalise(line.ProductName ?? '');
        if (productName.length < MIN_DESCRIPTION_MATCH_LENGTH) return false;
        return productName.includes(description) || description.includes(productName);
      });
      if (byName) return byName;
    }

    return null;
  }

  private remainingOf(line: PurchaseOrderLine): number {
    const remaining = Number(line.RemainingPurchaseQuantity);
    if (!isNaN(remaining) && remaining >= 0) return remaining;
    const ordered = Number(line.OrderedPurchaseQuantity ?? line.PurchaseQuantity);
    return isNaN(ordered) || ordered < 0 ? 0 : ordered;
  }

  private updateRow(index: number, change: (row: ScanMatchRow) => ScanMatchRow): void {
    this._rows.update((rows) => rows.map((row, i) => (i === index ? change(row) : row)));
  }

  private normalise(value: string): string {
    return value.trim().toUpperCase();
  }

  private strip(value: string): string {
    return value.replace(/[^A-Z0-9]/g, '');
  }

  private round(value: number): number {
    return Math.round(value * QTY_PRECISION) / QTY_PRECISION;
  }

  private messageOf(err: unknown, fallback: string): string {
    if (err instanceof DocumentOcrError) return err.message;
    if (err instanceof Error && err.message && err.name !== 'HttpErrorResponse') {
      return err.message;
    }
    return fallback;
  }
}

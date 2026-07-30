import { PurchaseOrderLine } from './purchase-order.model';

// ── Extraction returned by POST /api/ocr ────────────────────
// Mirrors EXTRACTION_SCHEMA in api/_lib/po-extraction.service.js. Every field is
// always present — the reader writes '' or 0 rather than omitting a value.

export type ScannedDocumentType =
  | 'purchase_order'
  | 'delivery_note'
  | 'packing_slip'
  | 'invoice'
  | 'other';

export type ScanConfidence = 'high' | 'medium' | 'low';

export interface ScannedOrderLine {
  lineNumber: number;
  itemNumber: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export interface ScannedPurchaseOrder {
  documentType: ScannedDocumentType;
  poNumber: string;
  vendorName: string;
  vendorAccount: string;
  orderDate: string;
  currencyCode: string;
  confidence: ScanConfidence;
  notes: string;
  lines: ScannedOrderLine[];
}

// ── Captured photo, normalised for upload ───────────────────
export interface CapturedImage {
  /** Raw base64 payload — no data: prefix, which /api/ocr rejects. */
  base64: string;
  mediaType: string;
  /** Full data URL, for the on-screen thumbnail. */
  previewDataUrl: string;
}

export type CaptureSource = 'camera' | 'library';

// ── Scanned line reconciled against the live D365 order ─────
export type ScanMatchStatus =
  /** Found on the order with quantity still outstanding. */
  | 'matched'
  /** Found on the order, but nothing left to receive. */
  | 'fully-received'
  /** No line on this order carries that item. */
  | 'not-on-order';

export interface ScanMatchRow {
  scanned: ScannedOrderLine;
  poLine: PurchaseOrderLine | null;
  status: ScanMatchStatus;
  /** Outstanding quantity on the matched PO line; 0 when unmatched. */
  remainingQty: number;
  /** Quantity to receive — starts at the scanned quantity, clamped to remaining. */
  qty: number;
  /** Whether this row is part of the receipt. Unmatched rows are always off. */
  include: boolean;
}

// ── Flow state ──────────────────────────────────────────────
export type ScanStage =
  | 'capture'
  | 'extracting'
  | 'review'
  | 'matching'
  | 'receipt'
  | 'submitting'
  | 'done';

export interface ScanActionResult {
  ok: boolean;
  /** User-facing reason when `ok` is false. Already safe to display. */
  message?: string;
}

export interface ConfirmedScanReceipt {
  poNumber: string;
  packingSlipId: string;
  totalQty: number;
  lines: { itemNumber: string; productName?: string; qty: number; unit?: string }[];
}

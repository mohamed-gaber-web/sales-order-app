// ── D365 Purchase Order Header ──────────────────────────────
// Field names are discovered at runtime — only PurchaseOrderNumber is guaranteed.
// All vendor/status fields kept optional until confirmed from a live response.
export interface PurchaseOrderHeader {
  dataAreaId: string;
  PurchaseOrderNumber: string;
  // Vendor — actual field name TBD from live response
  OrderVendorAccountNumber?: string;
  VendorAccountNumber?: string;
  InvoiceVendorAccountNumber?: string;
  // Status
  PurchaseOrderStatus?: string;
  DocumentApprovalStatus?: string;
  // Financials
  CurrencyCode?: string;
  // Dates
  RequestedDeliveryDate?: string;
  DeliveryAddressName?: string;
  // Lines (expanded)
  PurchaseOrderLinesV2?: PurchaseOrderLine[];
  // Catch-all for any other fields D365 returns
  [key: string]: unknown;
}

// ── D365 Purchase Order Line ────────────────────────────────
export interface PurchaseOrderLine {
  dataAreaId: string;
  PurchaseOrderNumber: string;
  LineNumber: number;
  ItemNumber: string;
  ProductName?: string;
  PurchaseQuantity: number;
  OrderedPurchaseQuantity?: number;
  RemainingPurchaseQuantity?: number;
  PurchaseUnitSymbol?: string;
  ReceivingWarehouseId?: string;
  PurchasePrice?: number;
  LineAmount?: number;
}

// ── D365 Product Receipt Line ───────────────────────────────
// One row per line per posted receipt. RemainingPurchaseQuantity here is the
// running remaining-to-receive balance as of that receipt — PurchaseOrderLinesV2
// itself carries no remaining/received quantity field.
export interface ProductReceiptLine {
  dataAreaId: string;
  PurchaseOrderNumber: string;
  PurchaseOrderLineNumber: number;
  ItemNumber: string;
  RecordId: number;
  ReceivedPurchaseQuantity: number;
  RemainingPurchaseQuantity: number;
}

// ── POST: Create Product Receipt ───────────────────────────
export interface CreateProductReceiptRequest {
  _request: {
    DataAreaId: string;
    purchaseOrderID: string;
    productReceiptId: string;
    purchaseLineNum: number[];
    productReceiptQty: number[];
  };
}

export interface CreateProductReceiptResponse {
  Success: boolean;
  ErrorMessage?: string;
  DebugMessage?: string;
  PackingSlipId?: string;
}

// ── POST: Register Purchase Order (arrival registration) ────
// GP_PORegistrationAPIService/registerPurchaseOrder. Unlike createProductReceipt this
// takes one object per line instead of parallel arrays, and carries no receipt ID.
export interface RegisterPurchaseOrderLine {
  LineNumber: number;
  RegisterQty: number;
  /** Optional in the service contract; the app doesn't collect either field today. */
  WMSLocationId?: string;
  InventBatchId?: string;
}

export interface RegisterPurchaseOrderRequest {
  _request: {
    DataAreaId: string;
    PurchaseOrderId: string;
    Lines: RegisterPurchaseOrderLine[];
  };
}

// Shape confirmed against the live service. RegisteredLines comes back null on failure;
// its element shape isn't in the contract metadata, so it stays loose until seen.
export interface RegisterPurchaseOrderResponse {
  Success: boolean;
  ErrorMessage?: string;
  DebugMessage?: string;
  PurchaseOrderId?: string;
  RegisteredLineCount?: number;
  RegisteredLines?: Record<string, unknown>[] | null;
}

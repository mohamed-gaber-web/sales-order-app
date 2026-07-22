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

// ── POST: Create Product Receipt ───────────────────────────
export interface CreateProductReceiptRequest {
  _request: {
    DataAreaId: string;
    purchaseOrderID: string;
    packingSlipId: string;
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

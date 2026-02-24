// ── D365 Sales Order Header ────────────────────────────────
export interface CreateSalesOrderHeaderDto {
  dataAreaId: string;
  CurrencyCode: string;
  OrderingCustomerAccountNumber: string;
  SalesOrderNumber: string;
}

export interface SalesOrderHeaderResponse {
  dataAreaId: string;
  CurrencyCode: string;
  // Sales order identifier
  SalesId: string;                          // Sales Order Number
  // Customer
  CustAccount: string;                      // Customer Account
  SalesTable_SalesName?: string;            // Customer Name
  // Invoice
  SalesTable_InvoiceAccount?: string;       // Invoice Account
  // Order type & status
  SalesType?: string;                       // Order Type (e.g. Sales, ReturnOrder)
  SalesTable_SalesStatus?: string;          // Status (e.g. Invoiced, Backorder)
  SalesTable_DocumentStatus?: string;       // Release / document status (e.g. Invoice)
  // Dates
  ShippingDateRequested?: string;
}

// ── Legacy local model ─────────────────────────────────────
export interface SalesOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  orderDate: Date;
  deliveryDate?: Date;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  productName: string;
  productCode?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export type OrderStatus = 'draft' | 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  draft: 'medium',
  pending: 'warning',
  confirmed: 'primary',
  processing: 'secondary',
  shipped: 'tertiary',
  delivered: 'success',
  cancelled: 'danger'
};

export interface TransferOrderHeader {
  dataAreaId: string;
  TransferOrderNumber: string;
  TransferOrderStatus?: string;
  ShippingWarehouseId?: string;
  ReceivingWarehouseId?: string;
  RequestedShippingDate?: string;
  RequestedReceiptDate?: string;
  ShippingAddressName?: string;
  ReceivingAddressName?: string;
  TransitWarehouseId?: string;
  [key: string]: unknown;
}

export interface TransferOrderLine {
  dataAreaId: string;
  TransferOrderNumber: string;
  LineNumber: number;
  ItemNumber: string;
  LineStatus?: string;
  TransferQuantity: number;
  ShippedQuantity?: number;
  ReceivedQuantity?: number;
  RemainingShippedQuantity?: number;
  RemainingReceivedQuantity?: number;
  InventoryUnitSymbol?: string;
  UnitId?: string;
  ProductConfigurationId?: string;
  ProductColorId?: string;
  ProductSizeId?: string;
}

import { CreatePurchaseOrderHeaderDto, CreatePurchaseOrderLineDto } from '../../../models/purchase-order.model';

/** Every purchase order is raised in Egyptian pounds, whatever the vendor's own currency. */
export const PO_CURRENCY = 'EGP';

/** The item and quantity side of a line, as the operator entered it. */
export interface PurchaseOrderLineInput {
  LineNumber: number;
  ItemNumber: string;
  ProductConfigurationId: string;
  ProductSizeId: string;
  ProductColorId: string;
  ProductStyleId: string;
  OrderedPurchaseQuantity: number;
  /** Null when left blank. */
  PurchasePrice: number | null;
}

/** Where and when every line of the order is received. */
export interface PurchaseOrderReceiving {
  ReceivingSiteId: string;
  ReceivingWarehouseId: string;
  ReceivingWarehouseLocationId: string;
  /** yyyy-MM-dd. */
  deliveryDate: string;
}

/** A calendar date at midday UTC, which keeps the same date in every time zone. */
export function d365Date(isoDay: string): string {
  return `${isoDay}T12:00:00Z`;
}

export function buildHeaderPayload(
  dataAreaId: string,
  vendorAccount: string,
  accountingDay: string
): CreatePurchaseOrderHeaderDto {
  return {
    dataAreaId,
    OrderVendorAccountNumber: vendorAccount,
    AccountingDate: d365Date(accountingDay),
    CurrencyCode: PO_CURRENCY,
  };
}

/**
 * The line body. Price and receipt location are only sent when given: an
 * empty value would override what D365 would otherwise default from the
 * vendor's trade agreement and the warehouse's receipt location.
 */
export function buildLinePayload(
  dataAreaId: string,
  orderNumber: string,
  receiving: PurchaseOrderReceiving,
  line: PurchaseOrderLineInput
): CreatePurchaseOrderLineDto {
  const date = d365Date(receiving.deliveryDate);
  const location = receiving.ReceivingWarehouseLocationId.trim();
  return {
    dataAreaId,
    PurchaseOrderNumber: orderNumber,
    LineNumber: line.LineNumber,
    ItemNumber: line.ItemNumber,
    ProductConfigurationId: line.ProductConfigurationId,
    ProductSizeId: line.ProductSizeId,
    ProductColorId: line.ProductColorId,
    ProductStyleId: line.ProductStyleId,
    ProductVersionId: '',
    ItemBatchNumber: '',
    ItemSerialNumber: '',
    OrderedPurchaseQuantity: line.OrderedPurchaseQuantity,
    ReceivingSiteId: receiving.ReceivingSiteId,
    ReceivingWarehouseId: receiving.ReceivingWarehouseId,
    ...(location ? { ReceivingWarehouseLocationId: location } : {}),
    ...(line.PurchasePrice !== null ? { PurchasePrice: line.PurchasePrice } : {}),
    PurchasePriceQuantity: 1,
    LineDiscountAmount: 0,
    LineDiscountPercentage: 0,
    RequestedDeliveryDate: date,
    RequestedShippingDate: date,
  };
}

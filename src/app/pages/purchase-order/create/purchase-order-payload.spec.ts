import { buildHeaderPayload, buildLinePayload, PurchaseOrderLineInput, PurchaseOrderReceiving } from './purchase-order-payload';

describe('purchase order payloads', () => {
  const receiving: PurchaseOrderReceiving = {
    ReceivingSiteId: '1',
    ReceivingWarehouseId: '11',
    ReceivingWarehouseLocationId: '11',
    deliveryDate: '2026-11-05',
  };
  const line: PurchaseOrderLineInput = {
    LineNumber: 1,
    ItemNumber: 'M0005',
    ProductConfigurationId: '',
    ProductSizeId: '',
    ProductColorId: '',
    ProductStyleId: '',
    OrderedPurchaseQuantity: 3,
  };

  it('builds the header from the tenant company, the vendor, today and the receiving warehouse, in EGP', () => {
    expect(buildHeaderPayload('007', 'US-102', '2026-10-29', receiving)).toEqual({
      dataAreaId: '007',
      OrderVendorAccountNumber: 'US-102',
      AccountingDate: '2026-10-29T12:00:00Z',
      CurrencyCode: 'EGP',
      DefaultReceivingSiteId: '1',
      DefaultReceivingWarehouseId: '11',
    });
  });

  it('builds the line in the agreed shape', () => {
    expect(buildLinePayload('007', '00000375', receiving, line)).toEqual({
      dataAreaId: '007',
      PurchaseOrderNumber: '00000375',
      LineNumber: 1,
      ItemNumber: 'M0005',
      ProductConfigurationId: '',
      ProductSizeId: '',
      ProductColorId: '',
      ProductStyleId: '',
      ProductVersionId: '',
      ItemBatchNumber: '',
      ItemSerialNumber: '',
      OrderedPurchaseQuantity: 3,
      ReceivingSiteId: '1',
      ReceivingWarehouseId: '11',
      ReceivingWarehouseLocationId: '11',
      PurchasePriceQuantity: 1,
      LineDiscountAmount: 0,
      LineDiscountPercentage: 0,
      RequestedDeliveryDate: '2026-11-05T12:00:00Z',
      RequestedShippingDate: '2026-11-05T12:00:00Z',
    });
  });

  it('never sends a price, so D365 prices the line from the vendor agreement', () => {
    expect('PurchasePrice' in buildLinePayload('007', '00000375', receiving, line)).toBeFalse();
  });

  it('leaves out a blank location so D365 defaults it', () => {
    const body = buildLinePayload('007', '00000375', { ...receiving, ReceivingWarehouseLocationId: '  ' }, line);
    expect('ReceivingWarehouseLocationId' in body).toBeFalse();
  });
});

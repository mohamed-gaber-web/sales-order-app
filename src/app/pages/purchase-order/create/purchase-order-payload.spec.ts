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
    PurchasePrice: 79.99,
  };

  it('builds the header from the tenant company, the vendor and today, in EGP', () => {
    expect(buildHeaderPayload('007', 'US-102', '2026-10-29')).toEqual({
      dataAreaId: '007',
      OrderVendorAccountNumber: 'US-102',
      AccountingDate: '2026-10-29T12:00:00Z',
      CurrencyCode: 'EGP',
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
      PurchasePrice: 79.99,
      PurchasePriceQuantity: 1,
      LineDiscountAmount: 0,
      LineDiscountPercentage: 0,
      RequestedDeliveryDate: '2026-11-05T12:00:00Z',
      RequestedShippingDate: '2026-11-05T12:00:00Z',
    });
  });

  it('leaves out a blank price and location so D365 defaults them', () => {
    const body = buildLinePayload('007', '00000375', { ...receiving, ReceivingWarehouseLocationId: '  ' }, {
      ...line,
      PurchasePrice: null,
    });
    expect('PurchasePrice' in body).toBeFalse();
    expect('ReceivingWarehouseLocationId' in body).toBeFalse();
  });

  it('keeps a price of zero', () => {
    expect(buildLinePayload('007', '1', receiving, { ...line, PurchasePrice: 0 }).PurchasePrice).toBe(0);
  });
});

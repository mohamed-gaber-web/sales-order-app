import {
  Customer,
  JourneyStop,
  LoyaltyRules,
  PriceAgreement,
  Product,
  PromotionRule,
  RepSetup,
  ReturnReason,
  SalesOrder,
  SurveyDefinition,
  TaxGroup,
  VanStockLine,
} from './van-sales.models';

/**
 * The simulation's seed — the data the acceptance scenarios (spec §11) are
 * written against. Demo values only: in production every figure here comes
 * from master data. Coordinates are placeholder Giza geography, not customers.
 */

export const MOCK_REP_SETUP: RepSetup = {
  repId: 'REP-11',
  workerName: 'Mahmoud Adel',
  role: 'VAN_SELLER',
  vanWarehouse: 'VAN-11',
  mainWarehouse: 'WH-GIZA',
  routeId: 'RT-CAI-04',
  supervisorId: 'SUP-02',
  manualDiscountLimitPct: 3,
  freeReturnLimitPerVisit: 1000,
  geofenceRadiusM: 100,
  geofenceRequired: false,
  deviceSerial: 'VAN-11-TAB',
  docNumberSeqPrefix: { invoice: 'VI-11-', order: 'SO-11-', return: 'RT-11-', receipt: 'RC-11-' },
  deliveryCanTakeOrders: false,
  currency: 'EGP',
};

export const MOCK_CUSTOMERS: Customer[] = [
  {
    id: 'CU-004501', name: 'Al Noor Supermarket', address: '12 Ahmed Orabi St, Mohandessin, Giza',
    lat: 30.0553, lon: 31.2015, priceGroup: 'Key account', taxId: '204-551-873',
    paymentTerms: 'CREDIT', creditLimit: 40000, overdue: false, creditHold: false,
    openInvoices: [{ invoiceId: 'INV-88410', date: '2026-09-10', dueDate: '2026-10-10', amount: 3200 }],
    loyalty: { points: 2450, tier: 'Silver' },
  },
  {
    id: 'CU-004508', name: 'Al Salam Grocery', address: '45 Tahrir St, Dokki, Giza',
    lat: 30.0384, lon: 31.2119, priceGroup: 'Retail',
    paymentTerms: 'CREDIT', creditLimit: 15000, overdue: false, creditHold: true,
    holdReason: 'Bounced cheque 771204 (CIB)',
    openInvoices: [{ invoiceId: 'INV-87990', date: '2026-08-28', dueDate: '2026-09-27', amount: 2400 }],
    loyalty: { points: 320, tier: 'Bronze' },
  },
  {
    id: 'CU-004512', name: 'Al Fath Market — Faisal', address: '88 Faisal St, Faisal, Giza',
    lat: 30.0128, lon: 31.1834, priceGroup: 'Wholesale', taxId: '311-204-117',
    paymentTerms: 'CREDIT', creditLimit: 30000, overdue: false, creditHold: false,
    openInvoices: [
      { invoiceId: 'INV-87651', date: '2026-08-19', dueDate: '2026-09-18', amount: 5760 },
      { invoiceId: 'INV-88103', date: '2026-09-02', dueDate: '2026-10-02', amount: 6540 },
    ],
    loyalty: { points: 1180, tier: 'Silver' },
  },
  {
    id: 'CU-004515', name: 'Abu Omar Grocery', address: '3 Al Nil St, Agouza, Giza',
    lat: 30.0577, lon: 31.2043, priceGroup: 'Retail',
    paymentTerms: 'CASH', creditLimit: 0, overdue: false, creditHold: false,
    openInvoices: [],
    loyalty: { points: 140, tier: 'Bronze' },
  },
  {
    id: 'CU-004520', name: 'Al Osra Hyper', address: 'Mall of Arabia, 6th of October City, Giza',
    lat: 29.976, lon: 30.9432, priceGroup: 'Key account', taxId: '118-990-402',
    paymentTerms: 'CREDIT', creditLimit: 25000, overdue: true, creditHold: false,
    openInvoices: [
      { invoiceId: 'INV-86120', date: '2026-07-14', dueDate: '2026-08-13', amount: 4100 },
      { invoiceId: 'INV-87002', date: '2026-08-05', dueDate: '2026-09-04', amount: 1500 },
    ],
    loyalty: { points: 5600, tier: 'Gold' },
  },
  {
    id: 'CU-004210', name: 'Bait El Kheir Market', address: '21 El Haram St, Haram, Giza',
    lat: 29.9936, lon: 31.1532, priceGroup: 'Retail',
    paymentTerms: 'CREDIT', creditLimit: 12000, overdue: false, creditHold: false,
    openInvoices: [],
    loyalty: { points: 60, tier: 'Bronze' },
  },
  {
    id: 'CU-004877', name: 'El Hana Minimarket', address: '7 Sudan St, Imbaba, Giza',
    lat: 30.0761, lon: 31.2074, priceGroup: 'Retail',
    paymentTerms: 'CASH', creditLimit: 0, overdue: false, creditHold: false,
    openInvoices: [],
  },
];

export const MOCK_JOURNEY: JourneyStop[] = [
  { customerId: 'CU-004501', sequence: 1, eta: '8:15', windowFrom: '8', windowTo: '11' },
  { customerId: 'CU-004508', sequence: 2, eta: '9:05', windowFrom: '8', windowTo: '12' },
  { customerId: 'CU-004512', sequence: 3, eta: '9:50', windowFrom: '9', windowTo: '12', priority: 'HIGH' },
  { customerId: 'CU-004515', sequence: 4, eta: '10:35' },
  { customerId: 'CU-004520', sequence: 5, eta: '11:10', windowFrom: '10', windowTo: '14' },
  { customerId: 'CU-004210', sequence: 6, eta: '12:00', windowFrom: '11', windowTo: '15' },
  { customerId: 'CU-004877', sequence: 7, eta: '12:45' },
];

export const MOCK_PRODUCTS: Product[] = [
  { itemId: '1001', name: 'Sunflower oil 1 L', unit: 'pcs', cartonQty: 12, barcode: '6221000100101', basePrice: 78, taxGroup: 'VAT14' },
  { itemId: '1002', name: 'Egyptian rice 5 kg', unit: 'pcs', cartonQty: 4, barcode: '6221000100202', basePrice: 185, taxGroup: 'VAT0' },
  { itemId: '1003', name: 'Pasta penne 400 g', unit: 'pcs', cartonQty: 20, barcode: '6221000100303', basePrice: 14.5, taxGroup: 'VAT14' },
  { itemId: '1004', name: 'Tomato paste 12 × 360 g', unit: 'pack', cartonQty: 4, barcode: '6221000100404', basePrice: 110, taxGroup: 'VAT14' },
  { itemId: '1005', name: 'White sugar 1 kg', unit: 'pcs', cartonQty: 10, barcode: '6221000100505', basePrice: 32, taxGroup: 'VAT0' },
  { itemId: '1006', name: 'Ghee 800 g', unit: 'pcs', cartonQty: 12, barcode: '6221000100606', basePrice: 35, taxGroup: 'VAT14' },
  { itemId: '1007', name: 'Black tea 250 g', unit: 'pcs', cartonQty: 24, barcode: '6221000100707', basePrice: 42, taxGroup: 'VAT14' },
  { itemId: '1008', name: 'White cheese 500 g', unit: 'pcs', cartonQty: 12, barcode: '6221000100808', basePrice: 58, taxGroup: 'VAT14' },
];

export const MOCK_PRICE_GROUP_FACTORS: Record<string, number> = {
  Retail: 1,
  Wholesale: 0.95,
  'Key account': 0.92,
};

/** Explicit agreements win over the group factor. */
export const MOCK_PRICES: PriceAgreement[] = [
  { itemId: '1003', priceGroup: 'Wholesale', unitPrice: 14.5 },
  { itemId: '1004', priceGroup: 'Wholesale', unitPrice: 110 },
  { itemId: '1004', priceGroup: 'Key account', unitPrice: 108 },
];

export const MOCK_TAX_GROUPS: TaxGroup[] = [
  { code: 'VAT14', ratePct: 14 },
  { code: 'VAT0', ratePct: 0 },
];

export const MOCK_REASONS: ReturnReason[] = [
  { code: 'RTN-EXP', description: 'Expired', disposition: 'SCRAP', sellable: false },
  { code: 'RTN-DMG', description: 'Damaged', disposition: 'QUARANTINE', sellable: false },
  { code: 'RTN-SLOW', description: 'Slow moving — good condition', disposition: 'RESTOCK', sellable: true },
  { code: 'RTN-WRONG', description: 'Wrong item delivered', disposition: 'RESTOCK', sellable: true },
];

export const MOCK_PROMOTIONS: PromotionRule[] = [
  {
    id: 'PR-FOC-PASTA', name: 'Pasta 10 + 1', type: 'FOC', validFrom: '2026-01-01', validTo: '2026-12-31',
    itemIds: ['1003'], buyQty: 10, freeQty: 1,
  },
  {
    id: 'PR-TIER-TOMATO', name: 'Tomato paste volume', type: 'LINE_TIER', validFrom: '2026-01-01', validTo: '2026-12-31',
    itemIds: ['1004'], minQty: 48, discountPct: 5,
  },
  {
    id: 'PR-MIX-BREAKFAST', name: 'Breakfast bundle', type: 'MIX_MATCH', validFrom: '2026-01-01', validTo: '2026-12-31',
    itemIds: ['1007', '1008'], minEachQty: 6, discountPct: 3,
  },
  {
    id: 'PR-INV-5000', name: 'Big basket', type: 'INVOICE_THRESHOLD', validFrom: '2026-01-01', validTo: '2026-12-31',
    minNetAmount: 5000, discountPct: 2, budgetRemaining: 20000,
  },
  {
    id: 'PR-OIL-SUMMER', name: 'Summer oil', type: 'LINE_TIER', validFrom: '2026-06-01', validTo: '2026-08-31',
    itemIds: ['1001'], minQty: 12, discountPct: 4,
  },
];

/** Starting surveys for the demo — edit, add or delete them in the survey builder. */
export const MOCK_SURVEYS: SurveyDefinition[] = [
  {
    id: 'SV-SHELF', name: 'Shelf check', active: true,
    description: 'Is our range on the shelf, and how does it look against competitors?',
    questions: [
      { id: 'q1', text: 'Are our products on the shelf?', type: 'YES_NO', required: true },
      { id: 'q1b', text: 'Why not?', type: 'CHOICE', required: true, options: ['Out of stock', 'No shelf space', 'Store refused', 'Other'], showIf: { questionId: 'q1', equals: 'No' } },
      { id: 'q2', text: 'Shelf position', type: 'CHOICE', required: true, options: ['Eye level', 'Top', 'Bottom', 'Floor stand'], showIf: { questionId: 'q1', equals: 'Yes' } },
      { id: 'q3', text: 'Pasta facings', type: 'NUMBER', required: false, min: 0, max: 50, help: 'Count the packs facing the customer, front row only.', showIf: { questionId: 'q1', equals: 'Yes' } },
      { id: 'q4', text: 'Competitors present', type: 'MULTI_CHOICE', required: false, options: ['Brand A', 'Brand B', 'Brand C', 'Store brand'] },
      { id: 'q5', text: 'Shelf condition', type: 'RATING', required: true, max: 5, help: '1 is empty or dirty, 5 is full and tidy.' },
      { id: 'q6', text: 'Competitor activity', type: 'TEXT', required: false },
      { id: 'q7', text: 'Photo of the shelf', type: 'PHOTO', required: true },
    ],
  },
  {
    id: 'SV-PROMO', name: 'Promotion display', active: true, customerGroups: ['Key account', 'Wholesale'],
    description: 'Check the promotion display at key accounts.',
    questions: [
      { id: 'p1', text: 'Is the promotion display up?', type: 'YES_NO', required: true },
      { id: 'p2', text: 'Photo of the display', type: 'PHOTO', required: true, showIf: { questionId: 'p1', equals: 'Yes' } },
      { id: 'p3', text: 'What is missing?', type: 'MULTI_CHOICE', required: true, options: ['Stand', 'Price tags', 'Posters', 'Stock'], showIf: { questionId: 'p1', equals: 'No' } },
    ],
  },
];

export const MOCK_LOYALTY: LoyaltyRules = {
  earnPerUnit: 0.01,
  redeemValuePerPoint: 0.1,
  minRedeemPoints: 100,
  tiers: [
    { name: 'Bronze', minPoints: 0 },
    { name: 'Silver', minPoints: 1000 },
    { name: 'Gold', minPoints: 5000 },
  ],
};

export const MOCK_BANKS = [
  'National Bank of Egypt',
  'Banque Misr',
  'CIB',
  'QNB Alahli',
  'HSBC Egypt',
  'Arab African International Bank',
];

export const MOCK_VAN_STOCK: VanStockLine[] = [
  { itemId: '1001', qty: 60 },
  { itemId: '1002', qty: 40 },
  { itemId: '1003', qty: 200 },
  { itemId: '1004', qty: 96 },
  { itemId: '1005', qty: 100 },
  { itemId: '1006', qty: 50 },
  { itemId: '1007', qty: 80 },
  { itemId: '1008', qty: 40 },
];

export const MOCK_ORDERS: SalesOrder[] = [
  {
    salesId: 'SO-24031', customerId: 'CU-004210', createdAt: '2026-09-26', requestedShipDate: '2026-09-27',
    payMode: 'CREDIT', status: 'READY', total: 0,
    lines: [
      { itemId: '1002', qty: 12, freeQty: 0, unitPrice: 185, lineDiscount: 0 },
      { itemId: '1005', qty: 20, freeQty: 0, unitPrice: 32, lineDiscount: 0 },
    ],
  },
  {
    salesId: 'SO-24035', customerId: 'CU-004512', createdAt: '2026-09-26', requestedShipDate: '2026-09-27',
    payMode: 'CREDIT', status: 'READY', total: 0,
    lines: [
      { itemId: '1001', qty: 24, freeQty: 0, unitPrice: 74.1, lineDiscount: 0 },
      { itemId: '1003', qty: 40, freeQty: 4, unitPrice: 14.5, lineDiscount: 0 },
    ],
  },
];

export const MOCK_LAST_PRICES = [
  { customerId: 'CU-004877', itemId: '1006', price: 35 },
  { customerId: 'CU-004877', itemId: '1008', price: 56 },
  { customerId: 'CU-004512', itemId: '1003', price: 14.5 },
];

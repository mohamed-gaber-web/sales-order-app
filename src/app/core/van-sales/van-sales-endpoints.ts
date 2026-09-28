/**
 * Every Van Sales path, numbered as in the API catalogue (spec §6.2).
 *
 * One file so the backend team can rename a service without a hunt: entity
 * names must still be verified against the environment's `/data/$metadata`.
 * All of these travel through the portal's `/d365` pass-through — see
 * `ApiService` — so no path here carries a host.
 */

/** Custom-service body wrapper. D365 JSON services key the body by contract parameter name. */
export const SERVICE_BODY_WRAPPER = '_request';

const SVC = '/api/services/VSServices';

export const VAN_ENDPOINTS = {
  1: '/data/CustomersV3',
  2: '/data/CustomerPostalAddresses',
  3: '/data/CustomerGroups',
  5: '/data/ReleasedProductsV2',
  6: '/data/ItemBarcodes',
  7: '/data/ProductUnitOfMeasureConversions',
  8: '/data/SalesPriceAgreements',
  9: '/data/TaxGroups',
  10: '/data/ReturnReasonCodes',
  11: '/data/Warehouses',
  12: '/data/VSRepSetups',
  13: '/data/VSJourneyPlans',
  14: '/data/VSPromotions',
  15: '/data/VSSurveys',
  16: '/data/VSLoyaltyRules',
  17: '/data/VSChequeBanks',
  18: `${SVC}/VSCustomerService/getOpenInvoices`,
  19: `${SVC}/VSCustomerService/checkCredit`,
  20: '/data/WarehousesOnHandV2',
  21: '/data/SalesOrderHeadersV2',
  22: `${SVC}/VSLoyaltyService/getBalance`,
  23: `${SVC}/VSPricingService/calculate`,
  24: `${SVC}/VSSalesService/createOrder`,
  25: `${SVC}/VSSalesService/postVanInvoice`,
  26: `${SVC}/VSDeliveryService/confirm`,
  27: `${SVC}/VSReturnService/postReturn`,
  28: `${SVC}/VSReturnService/postFreeReturn`,
  29: `${SVC}/VSCollectionService/post`,
  30: `${SVC}/VSCollectionService/registerCheque`,
  31: `${SVC}/VSVanService/loadRequest`,
  32: `${SVC}/VSVanService/receiveTransfer`,
  33: `${SVC}/VSVanService/unload`,
  35: '/data/VSCustomerRequests',
  36: '/data/VSVisitLogs',
  37: '/data/VSSurveyAnswers',
  38: `${SVC}/VSAttachmentService/upload`,
  39: `${SVC}/VSLoyaltyService/post`,
  40: '/data/VSRepExpenses',
  41: `${SVC}/VSDayCloseService/close`,
  43: '/eta/e-receipts',
  46: '/data/VSIntegrationLogs',
  /** Supervisor-side approval decisions (spec §8.5, pending the Workflow decision). */
  90: `${SVC}/VSApprovalService/submit`,
  91: `${SVC}/VSApprovalService/list`,
  92: `${SVC}/VSApprovalService/decide`,
  /** Cheque lifecycle moves (F6). */
  93: `${SVC}/VSCollectionService/updateChequeStatus`,
} as const;

export type VanApiNo = keyof typeof VAN_ENDPOINTS;

/** Custom services take a wrapped body; OData entity inserts take the row itself. */
export function wrapBody(apiNo: VanApiNo, body: unknown): unknown {
  return VAN_ENDPOINTS[apiNo].startsWith('/data/') ? body : { [SERVICE_BODY_WRAPPER]: body };
}

// Van Sales & Distribution — the layer every van-sales page builds on.
// See VAN_SALES_UPDATE_SPEC.md and docs/van-sales/DISCOVERY.md.
export * from './van-sales.models';
export * from './van-sales-endpoints';
export * from './van-sales-api';
export { VanSalesApiRouter } from './van-sales-api.router';
export { VanSalesMockApi, allowedNext } from './van-sales-mock.api';
export { NetworkStatusService } from './network-status.service';
export { VanOutboxService, MAX_ATTEMPTS } from './van-outbox.service';
export type { EnqueueRequest } from './van-outbox.service';
export { VanAttachmentService } from './van-attachment.service';
export { VanStoreService } from './van-store.service';
export type { VanLocalDay } from './van-store.service';
export { VanRoleService, ROLE_LABEL, ALL_ROLES } from './van-role.service';
export { VanApprovalService } from './van-approval.service';
export { VanDocumentsService } from './van-documents.service';
export { VanTransactionsService } from './van-transactions.service';
export type {
  InvoiceInput,
  OrderInput,
  DeliveryInput,
  ReturnInput,
  CollectionInput,
  VisitEvent,
  Position,
} from './van-transactions.service';
export { VanDevToolsService } from './van-dev-tools.service';
export * from './pricing-engine';
export * from './van-rules';
export { uuidV4, localIsoDate } from './van-uuid';
export * from './van-reports';
export * from './van-demo-data';
export * from './survey-logic';

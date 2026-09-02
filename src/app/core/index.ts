// Dynamics 365 access — every ERP call travels through the admin portal's
// /d365 proxy, which holds the Dynamics credential server-side.
export { ApiService, D365_COMPANY_HEADER } from './services/api.service';
export { describeD365ProxyError } from './services/d365-proxy.error';
export { LookupService } from './services/lookup.service';
export type { Company, Currency, Customer, ODataResponse } from './models/lookup.models';
export { SalesOrderLineService } from './services/sales-order-line.service';
export type { Site, Warehouse, ProductVariant, CreateSalesOrderLineDto } from './services/sales-order-line.service';
export { ThemeService } from './services/theme.service';
export type { ThemeMode } from './services/theme.service';

// Temporary: the Elsewedy sandbox token. Delete with useTestPurchaseOrderEnv.
export { AuthService } from './services/auth.service';

// User sign-in against the Grow Path Admin Portal
export * from './auth';

// The signed-in tenant's own configuration: environments, companies, modules
export * from './tenant';

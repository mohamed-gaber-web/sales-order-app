import { environment } from './environment';

/**
 * TEMPORARY: the Elsewedy-sandbox test config (see `environment.testPurchaseOrderAuth`)
 * lives only in local/dev environment files, not in the committed prod config, so these
 * fields are optional here. In prod they're absent → `useTestPurchaseOrderEnv` is falsy →
 * PurchaseOrderService uses the normal D365 endpoint and `getTestPurchaseOrderToken` is
 * never called. Remove this whole shim when the Elsewedy test routing is removed.
 */
export interface TestPurchaseOrderEnv {
  useTestPurchaseOrderEnv?: boolean;
  testPurchaseOrderAuth?: {
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
    scope: string;
    grantType: string;
  };
  testPurchaseOrderD365BaseUrl?: string;
}

/**
 * `environment` viewed with the optional test-PO fields, so code compiles whether or not
 * the active environment file declares them (dev/local does; committed prod does not).
 */
export const testPurchaseOrderEnv = environment as typeof environment & TestPurchaseOrderEnv;

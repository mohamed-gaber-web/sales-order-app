import { SalesOrderLineResponse } from '../../../core/services/sales-order-line.service';
import {
  SalesLineAction,
  SalesLineActionRequest,
  SalesLineDimensions,
} from '../../../models/sales-order.model';

/**
 * What the operator enters per line:
 * - `qty`: a quantity.
 * - `qtyDims`: a quantity plus site / warehouse / location / batch / serial /
 *   license plate (pick needs to say where the stock comes from).
 * - `none`: nothing; the line is just ticked (cancel the whole remainder).
 */
export type SalesLineInput = 'qty' | 'qtyDims' | 'none';

export interface SalesLineActionConfig {
  action: SalesLineAction;
  /** Path segment under /sales-order. */
  path: string;
  icon: string;
  input: SalesLineInput;
  /** Registration works on return orders, so it lists those instead. */
  returnsOnly: boolean;
  /** Cancels can't be undone: ask before sending, and start every line at "skip". */
  destructive: boolean;
}

export const SALES_LINE_ACTIONS: Record<SalesLineAction, SalesLineActionConfig> = {
  reserve: { action: 'reserve', path: 'line-reservation', icon: 'lock-closed-outline', input: 'qty', returnsOnly: false, destructive: false },
  pick: { action: 'pick', path: 'line-pick', icon: 'hand-left-outline', input: 'qtyDims', returnsOnly: false, destructive: false },
  register: { action: 'register', path: 'line-registration', icon: 'clipboard-outline', input: 'qty', returnsOnly: true, destructive: false },
  cancelRemainder: { action: 'cancelRemainder', path: 'line-cancel-remainder', icon: 'close-circle-outline', input: 'none', returnsOnly: false, destructive: true },
  cancelPartial: { action: 'cancelPartial', path: 'line-cancel-partial', icon: 'remove-circle-outline', input: 'qty', returnsOnly: false, destructive: true },
};

export const DIMENSION_FIELDS: (keyof SalesLineDimensions)[] = [
  'InventSiteId',
  'InventLocationId',
  'WMSLocationId',
  'InventBatchId',
  'InventSerialId',
  'LicensePlateId',
];

export function emptyDimensions(): SalesLineDimensions {
  return { InventSiteId: '', InventLocationId: '', WMSLocationId: '', InventBatchId: '', InventSerialId: '', LicensePlateId: '' };
}

/** Pick starts from the line's own site and warehouse; the operator can change them. */
export function lineDimensions(line: SalesOrderLineResponse): SalesLineDimensions {
  return { ...emptyDimensions(), InventSiteId: line.ShippingSiteId ?? '', InventLocationId: line.ShippingWarehouseId ?? '' };
}

/** Return lines carry a negative remainder; the services take a positive quantity. */
export function remainingQty(line: SalesOrderLineResponse): number {
  return Math.abs(Number(line.RemainingSalesPhysicalQuantity ?? line.OrderedSalesQuantity ?? 0)) || 0;
}

export function initialQty(config: SalesLineActionConfig, line: SalesOrderLineResponse): number {
  return config.destructive ? 0 : remainingQty(line);
}

export function buildSalesLineRequest(
  action: SalesLineAction,
  args: { dataAreaId: string; orderId: string; lineNum: number; qty: number; dims?: SalesLineDimensions },
): SalesLineActionRequest {
  const base = {
    DataAreaId: args.dataAreaId.toUpperCase(),
    OrderId: args.orderId,
    LineNum: args.lineNum,
    // salesLineCancel reads Qty 0 as "cancel everything that is left".
    Qty: action === 'cancelRemainder' ? 0 : args.qty,
  };
  if (action === 'cancelRemainder' || action === 'cancelPartial') {
    return { _request: base };
  }
  const dims = action === 'pick' ? { ...emptyDimensions(), ...args.dims } : emptyDimensions();
  // D365 wants every dimension present, trimmed, even when empty.
  for (const key of DIMENSION_FIELDS) dims[key] = (dims[key] ?? '').trim();
  return { _request: { ...base, ...dims } };
}

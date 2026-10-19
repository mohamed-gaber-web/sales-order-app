import { TransferLineAction } from '../../../models/inventory.model';
import { TransferOrderLine } from '../../../models/transfer-order.model';

/**
 * Reservation and pick happen on the shipping side of a transfer, so they work
 * on orders that have not shipped yet and on the quantity still to ship.
 * Registration happens on the receiving side: shipped orders, quantity still to
 * receive. Getting this wrong sends D365 lines it will refuse.
 */
export type TransferLineSide = 'ship' | 'receive';

export interface TransferLineActionConfig {
  action: TransferLineAction;
  /** Path segment under /inventory, also used to build links back to the list. */
  path: string;
  icon: string;
  side: TransferLineSide;
}

export const TRANSFER_LINE_ACTIONS: Record<TransferLineAction, TransferLineActionConfig> = {
  reserve: { action: 'reserve', path: 'transfer-reservation', icon: 'lock-closed-outline', side: 'ship' },
  pick: { action: 'pick', path: 'transfer-pick', icon: 'hand-left-outline', side: 'ship' },
  register: { action: 'register', path: 'transfer-registration', icon: 'clipboard-outline', side: 'receive' },
};

export function remainingQty(line: TransferOrderLine, side: TransferLineSide): number {
  // D365 returns RemainShipPhysical / RemainReceivePhysical; the model's names are the fallback.
  const raw = (line as unknown as Record<string, unknown>)[
    side === 'ship' ? 'RemainShipPhysical' : 'RemainReceivePhysical'
  ];
  if (raw !== undefined && raw !== null) return Number(raw);
  const mapped = side === 'ship' ? line.RemainingShippedQuantity : line.RemainingReceivedQuantity;
  return mapped ?? line.TransferQuantity ?? 0;
}

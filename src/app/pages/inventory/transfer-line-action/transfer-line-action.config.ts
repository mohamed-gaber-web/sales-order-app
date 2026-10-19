import { TransferLineAction } from '../../../models/inventory.model';
import { TransferOrderLine } from '../../../models/transfer-order.model';

/**
 * Which remaining quantity a line's quantity box starts at. Reservation and
 * pick happen on the shipping side of a transfer (quantity still to ship);
 * registration on the receiving side (quantity still to receive). Every action
 * lists the same orders as the Transfer Order screen.
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

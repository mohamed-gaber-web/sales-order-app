// Field names in TransferJournalConfirmPayload/Response are unverified
// placeholders pending the real confirm API. Kept in their own file (not
// inventory.model.ts) to avoid colliding with the existing TransferShipRequest /
// TransferReceiveRequest / TransferActionResponse used by the separate
// Transfer Order ship/receive feature.

export interface TransferJournalLine {
  soLineNumber: number;
  itemNumber: string;
  itemName?: string;
  qty: number;
  unitSymbol?: string;
}

export interface TransferJournalConfirmPayload {
  salesOrderNumber: string;
  dataAreaId: string;
  fromSiteId: string;
  fromWarehouseId: string;
  fromLocationId: string;
  toSiteId: string;
  toWarehouseId: string;
  toLocationId: string;
  lines: TransferJournalLine[];
}

export interface TransferJournalConfirmResponse {
  success: boolean;
  journalNumber?: string;
  errorMessage?: string;
}

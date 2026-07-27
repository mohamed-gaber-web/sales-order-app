// Field names verified on 2026-07-27 against the live entities
// `InventoryTransferJournalHeaders` and `InventoryTransferJournalEntries`.
// Kept in their own file (not inventory.model.ts) to avoid colliding with the
// existing TransferShipRequest / TransferReceiveRequest / TransferActionResponse
// used by the separate Transfer Order ship/receive feature.

/** `InventoryTransferJournalHeaders` — key is (dataAreaId, JournalNumber). */
export interface TransferJournalHeaderEntity {
  dataAreaId: string;
  JournalNumber: string;
  JournalNameId?: string;
  Description?: string;
  DefaultInventorySiteId?: string;
  DefaultWarehouseId?: string;
  IsPosted?: string;
}

/** `InventoryTransferJournalEntries` — key is (dataAreaId, JournalNumber, LineNumber). */
export interface TransferJournalLineEntity {
  dataAreaId: string;
  JournalNumber: string;
  LineNumber: number;
  ItemNumber: string;
  InventoryQuantity: number;
  TransactionDate: string;
  SourceInventorySiteId?: string;
  SourceWarehouseId?: string;
  SourceWarehouseLocationId?: string;
  SourceItemBatchNumber?: string;
  DestinationInventorySiteId?: string;
  DestinationWarehouseId?: string;
  DestinationWarehouseLocationId?: string;
  DestinationItemBatchNumber?: string;
}

/** Where the whole journal moves stock from and to — captured on the form step. */
export interface TransferRoute {
  fromSiteId: string;
  fromSiteName: string;
  fromWarehouseId: string;
  fromWarehouseName: string;
  fromLocationId: string;
  toSiteId: string;
  toSiteName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  toLocationId: string;
}

/** One scanned product and the quantity to move — collected on the scan step. */
export interface TransferJournalItem {
  itemNumber: string;
  itemName?: string;
  qty: number;
}

export interface TransferJournalRequest {
  route: TransferRoute;
  items: TransferJournalItem[];
}

/** The journal is created unposted — posting stays a D365-side step. */
export interface TransferJournalResult {
  success: boolean;
  journalNumber: string;
  errorMessage?: string;
}

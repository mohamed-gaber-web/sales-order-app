// ── Inventory Module Models ─────────────────────────────────────────────────

export interface WarehouseLocation {
  WarehouseId: string;
  LocationId: string;
  LocationType?: string;
  LocationProfileId?: string;
  IsBlocked?: boolean;
  MaxWeight?: number;
  MaxVolume?: number;
  dataAreaId?: string;
}

export interface Warehouse {
  WarehouseId: string;
  WarehouseName: string;
  OperationalSiteId?: string;
  dataAreaId?: string;
}

export interface InventoryOnHand {
  dataAreaId?: string;
  ItemNumber: string;
  ProductName?: string;
  ProductColorId?: string;
  ProductConfigurationId?: string;
  ProductSizeId?: string;
  ProductStyleId?: string;
  ProductVersionId?: string;
  InventorySiteId?: string;
  InventoryWarehouseId?: string;
  AvailableOnHandQuantity?: number;
  ReservedOnHandQuantity?: number;
  AvailableOrderedQuantity?: number;
  ReservedOrderedQuantity?: number;
  OnHandQuantity?: number;
  OrderedQuantity?: number;
  OnOrderQuantity?: number;
  TotalAvailableQuantity?: number;
  AreWarehouseManagementProcessesUsed?: string;
  // legacy fields kept for compatibility
  PhysicalInventoryQuantity?: number;
  AvailablePhysicalQuantity?: number;
  ReservedPhysicalQuantity?: number;
  UnitSymbol?: string;
}

export interface InventoryProduct {
  ProductNumber: string;
  ProductName?: string;
  ProductSearchName?: string;
  ProductType?: string;
  ProductSubType?: string;
  TrackingDimensionGroupName?: string;
  StorageDimensionGroupName?: string;
  dataAreaId?: string;
}

export interface ProductVariant {
  ProductMasterNumber: string;
  ProductVariantNumber: string;
  ProductColorId?: string;
  ProductSizeId?: string;
  ProductStyleId?: string;
  ProductConfigurationId?: string;
}

// ── Customer Returns (US-07) ─────────────────────────────────────────────────

export interface ReturnOrder {
  ReturnOrderNumber: string;
  CustomerAccountNumber: string;
  CustomerName?: string;
  ReturnOrderStatus?: string;
  OriginalSalesOrderNumber?: string;
  dataAreaId?: string;
}

export interface ReturnOrderLine {
  LineNumber: number;
  ItemNumber: string;
  ReturnedQuantity: number;
  RemainingQuantity?: number;
  UnitSymbol?: string;
  DispositionCode?: string;
  ConditionCode?: string;
}

export type DispositionType = 'Stock' | 'Quarantine' | 'Scrap' | 'Inspection';

export interface ReturnReceiptPayload {
  returnOrderNumber: string;
  lines: Array<{
    lineNumber: number;
    receivedQty: number;
    dispositionCode: DispositionType;
    conditionCode?: string;
    notes?: string;
  }>;
  receivedBy?: string;
}

// ── Sales Order Shipment (US-06) ─────────────────────────────────────────────

export interface SalesShipmentHeader {
  SalesOrderNumber: string;
  CustomerAccountNumber?: string;
  CustomerName?: string;
  SalesOrderStatus?: string;
  ShippingWarehouseId?: string;
  dataAreaId?: string;
}

export interface SalesShipmentLine {
  LineNumber: number;
  ItemNumber: string;
  OrderedQuantity: number;
  RemainInventPhysical?: number;
  UnitSymbol?: string;
  ShipNow?: number;
}

export interface CreatePackingSlipRequest {
  _request: {
    DataAreaId: string;
    SalesOrderId: string;
    PackingSlipId: string;
    salesLineNum: number[];
    packingSlipQty: number[];
  };
}

export interface CreatePackingSlipResponse {
  result?: string;
  Message?: string;
}

// ── Transfer Order Ship / Receive (US-03 extension) ──────────────────────────

export interface TransferActionResponse {
  Success: boolean;
  ErrorMessage?: string;
  DebugMessage?: string;
}

export interface TransferShipRequest {
  _request: {
    DataAreaId: string;
    transferOrderID: string;
    transferLineNum: number[];
    transferQTY: number[];
  };
}

export interface TransferReceiveRequest {
  _request: {
    DataAreaId: string;
    transferOrderID: string;
    transferLineNum: number[];
    transferQTY: number[];
  };
}

// ── Cycle Count (US-04) ──────────────────────────────────────────────────────

export interface CycleCountEntry {
  itemNumber: string;
  itemName?: string;
  warehouseId: string;
  locationId?: string;
  countedQty: number;
  expectedQty?: number;
  unitSymbol?: string;
  batchId?: string;
  serialId?: string;
}

export interface CycleCountJournal {
  journalId?: string;
  description: string;
  warehouseId: string;
  countedBy: string;
  countDate: string;
  lines: CycleCountEntry[];
  status: 'Draft' | 'Posted' | 'PendingApproval';
}

// ── Production Issue (US-02) ─────────────────────────────────────────────────

export interface ProductionOrder {
  ProductionOrderNumber: string;
  ItemNumber: string;
  ItemName?: string;
  OrderedQuantity: number;
  ReportedQuantity?: number;
  RemainingQuantity?: number;
  WarehouseId?: string;
  // Passed to reportAsFinished as LocationId / BatchId.
  LocationId?: string;
  ItemBatchNumber?: string;
  ProductionOrderStatus?: string;
  dataAreaId?: string;
}

/** Raw row of the D365 `ProductionOrderHeaders` entity — the fields this app reads. */
export interface ProductionOrderHeader {
  dataAreaId: string;
  ProductionOrderNumber: string;
  ItemNumber: string;
  ProductionOrderName?: string;
  ProductionOrderStatus?: string;
  ScheduledQuantity?: number;
  EstimatedQuantity?: number;
  StartedQuantity?: number;
  RemainingReportAsFinishedQuantity?: number;
  ItemBatchNumber?: string;
  ProductionWarehouseId?: string;
  ProductionWarehouseLocationId?: string;
}

export interface BomComponent {
  ItemNumber: string;
  ItemName?: string;
  RequiredQuantity: number;
  IssuedQuantity?: number;
  UnitSymbol?: string;
  WarehouseId?: string;
  BatchId?: string;
}

export interface ProductionIssuePayload {
  productionOrderNumber: string;
  dataAreaId: string;
  lines: Array<{
    itemNumber: string;
    issueQty: number;
    warehouseId: string;
    batchId?: string;
  }>;
}

// ── Report As Finished ───────────────────────────────────────────────────────

/** Request/response of GP_ProductionService.reportAsFinished (GP_ProdRAFRequestContract). */
export interface ProdRafRequest {
  _request: {
    DataAreaId: string;
    ProductionOrderId: string;
    GoodQuantity: number;
    ErrorQuantity: number;
    BatchId: string;
    LocationId: string;
    TransDate: string;
    AcceptError: 'Yes' | 'No';
    EndJob: 'Yes' | 'No';
  };
}

export interface ProdRafResponse {
  Success?: boolean;
  Message?: string;
  ProductionStatus?: string;
  /** Not in the published contract — read defensively in case a build adds it. */
  JournalId?: string;
}

export interface ReportAsFinishedLine {
  dataAreaId: string;
  productionOrderNumber: string;
  itemNumber: string;
  reportedQty: number;
  locationId?: string;
  batchId?: string;
}

export interface ReportAsFinishedPayload {
  lines: ReportAsFinishedLine[];
}

/** Outcome of one production order: reported as finished, then its journal posted. */
export interface ReportAsFinishedLineResult {
  productionOrderNumber: string;
  itemNumber: string;
  reportedQty: number;
  /** reportAsFinished accepted the quantity. */
  reported: boolean;
  /** postJournal ran and succeeded. False when no journal number could be resolved. */
  posted: boolean;
  journalNumber?: string;
  /** D365's own message from reportAsFinished. */
  message?: string;
  errorMessage?: string;
}

export interface ReportAsFinishedResponse {
  Success: boolean;
  Results: ReportAsFinishedLineResult[];
}

/** Request/response of GP_ProductionService.postJournal. */
export interface PostJournalRequest {
  _request: {
    JournalId: string;
    DataAreaId: string;
  };
}

export interface PostJournalResponse {
  Success?: boolean;
  JournalId?: string;
  Message?: string;
  Posted?: string;
  ErrorMessage?: string;
  DebugMessage?: string;
}

// ── Vendor Returns (US-08) ───────────────────────────────────────────────────

export interface VendorReturnLine {
  lineNumber: number;
  itemNumber: string;
  itemName?: string;
  returnQty: number;
  unitSymbol?: string;
  reasonCode: string;
  vendorAccount?: string;
}

export interface VendorReturnPayload {
  purchaseOrderNumber: string;
  dataAreaId: string;
  lines: VendorReturnLine[];
}

// ── License Plate (US-10) ────────────────────────────────────────────────────

export interface LicensePlate {
  LicensePlateId: string;
  WarehouseId?: string;
  LocationId?: string;
  Status?: 'Available' | 'Blocked' | 'InTransit';
  contents?: LicensePlateContent[];
}

export interface LicensePlateContent {
  itemNumber: string;
  itemName?: string;
  quantity: number;
  unitSymbol?: string;
  batchId?: string;
}

// ── Reservation (US-11) ─────────────────────────────────────────────────────

export interface ReservationLine {
  orderNumber: string;
  orderType: 'SalesOrder' | 'TransferOrder' | 'ProductionOrder' | 'PurchaseOrder';
  lineNumber: number;
  itemNumber: string;
  requiredQty: number;
  reservedQty: number;
  availableQty: number;
  unitSymbol?: string;
}

// ── Pick & Put (US-12) ───────────────────────────────────────────────────────

export type PickPutState = 'Idle' | 'WorkAssigned' | 'AtPickLocation' | 'ItemScanned' | 'QtyConfirmed' | 'AtPutLocation' | 'Completed';

export interface WorkItem {
  workId: string;
  workType: string;
  referenceId: string;
  status: string;
  lines: WorkLine[];
}

export interface WorkLine {
  lineNumber: number;
  itemNumber: string;
  itemName?: string;
  fromLocation: string;
  toLocation: string;
  requestedQty: number;
  pickedQty?: number;
  unitSymbol?: string;
  batchId?: string;
  licensePlateId?: string;
}

// ── Packing (US-13) ─────────────────────────────────────────────────────────

export interface PackingContainer {
  containerId: string;
  containerType: 'Carton' | 'Pallet';
  maxWeight?: number;
  maxVolume?: number;
  currentWeight?: number;
  currentVolume?: number;
  status: 'Open' | 'Closed';
  items: PackingItem[];
}

export interface PackingItem {
  itemNumber: string;
  itemName?: string;
  quantity: number;
  unitSymbol?: string;
  weight?: number;
}

// ── Assembly / Disassembly (US-05) ──────────────────────────────────────────

export interface AssemblyOrder {
  assemblyOrderNumber: string;
  parentItemNumber: string;
  parentItemName?: string;
  quantity: number;
  warehouseId?: string;
  status: 'Open' | 'InProgress' | 'Completed';
  components: BomComponent[];
}

// ── Barcode Count (create-by-scan flow) ─────────────────────────────────────

export interface CountCartItem {
  product: InventoryProduct;
  countedQty: number;
}

export interface CycleCountJournalHeader {
  dataAreaId: string;
  JournalNumber: string;
  /** References a Counting journal name configured in D365 (Inventory management > Setup > Journal names > Counting). Verify this field name against your environment's OData metadata before relying on it. */
  JournalNameId?: string;
  Description?: string;
  WorkerPersonnelNumber?: string;
  IsPosted?: string;
  CountingReasonCodeId?: string;
  [key: string]: unknown;
}

export interface CycleCountJournalLine {
  dataAreaId: string;
  JournalNumber: string;
  LineNumber: number;
  ItemNumber: string;
  InventorySiteId?: string;
  WarehouseId?: string;
  WarehouseLocationId?: string;
  ItemBatchNumber?: string;
  ItemSerialNumber?: string;
  LicensePlateNumber?: string;
  ProductColorId?: string;
  ProductSizeId?: string;
  ProductStyleId?: string;
  ProductConfigurationId?: string;
  CountingDate?: string;
  OnHandQuantity?: number;
  CountedQuantity?: number;
  AdjustmentQuantity?: number;
  [key: string]: unknown;
}

export interface ProductionPickingListEntry {
  dataAreaId: string;
  JournalNumber: string;
  JournalLineNumber: number;
  JournalName: string;
  JournalDescription: string;
  IsPosted: string;
  PostedDateTime?: string;
  ConsumptionDate?: string;
  ItemNumber: string;
  ProductionOrderNumber: string;
  ProposalBOMQuantity: number;
  ConsumptionBOMQuantity: number;
  ScrapBOMQuantity?: number;
  BOMUnitSymbol: string;
  WarehouseId?: string;
  WarehouseLocationId?: string;
  ProductionSiteId?: string;
  OperationNumber?: number;
  ItemBatchNumber?: string;
  ItemSerialNumber?: string;
}

export interface ProductionPickingJournal {
  JournalNumber: string;
  JournalName: string;
  JournalDescription: string;
  IsPosted: string;
  PostedDateTime?: string;
  ProductionOrderNumber: string;
  LineCount: number;
  dataAreaId: string;
}

# Inventory / Warehouse Module — Claude Code Prompts

> **Stack:** Angular + Ionic (existing app) · **Integration:** Microsoft Dynamics 365 Finance & Operations (D365 F&O) · **Pattern:** Mirror existing Sales module

---

## How to use this file

1. Open **Claude Code** in your project root.
2. Send the **Master Project Prompt** (section 1) as your **first message**. Wait for Claude to reply `Ready`.
3. Then send phase prompts in order (sections 2.0 → 2.8). One phase per session, or per branch.
4. Replace placeholders in **`[BRACKETS]`** before sending (paths, env names, etc.).
5. After each phase: review → run verification → commit → next phase.

**Convention used in this doc:** anything in `[UPPER_SNAKE_BRACKETS]` is a placeholder you must fill in.

---

## 1. Master Project Prompt

> Paste this once at the start. It gives Claude Code the global context it needs for every later prompt.

````
You are acting as the lead Angular/Ionic engineer adding a NEW module to an
existing production mobile app.

## PROJECT CONTEXT

- App: existing Angular + Ionic hybrid mobile app, already in production.
- Existing module to use as REFERENCE pattern: `[SALES_MODULE_PATH]`
  (e.g., `src/app/modules/sales/`). Follow its conventions for folder layout,
  service patterns, state management, routing, styling and testing.
- New module to build: **Inventory / Warehouse Management**.
- Module path: `[INVENTORY_MODULE_PATH]` (e.g., `src/app/modules/inventory/`).
- Integration target: **Microsoft Dynamics 365 Finance & Operations**
  (Warehouse Management / WHS).
- Backend pattern: same backend layer the Sales module uses
  (`[BACKEND_PATTERN]` — e.g., existing BFF, direct OData, or custom API
  gateway). Reuse it; do NOT introduce a new backend stack.

## TRANSACTIONS IN SCOPE (13 total)

| ID    | Transaction                              |
|-------|------------------------------------------|
| US-01 | Purchase Order Receiving                 |
| US-02 | Issue to Production / Internal Request   |
| US-03 | Warehouse Transfer                       |
| US-04 | Cycle Counting                           |
| US-05 | Assembly / Disassembly                   |
| US-06 | Sales Order Shipment                     |
| US-07 | Customer Returns                         |
| US-08 | Vendor Returns                           |
| US-09 | Location Management                      |
| US-10 | License Plate Management                 |
| US-11 | Reservation & Release                    |
| US-12 | Pick & Put                               |
| US-13 | Packing                                  |

(Full user stories with acceptance criteria are in
`[USER_STORIES_DOC_PATH]`. Open and read it before starting any phase.)

## TECH STACK (use only these — match the existing app)

- Angular `[ANGULAR_VERSION]` (standalone components if the existing app uses
  them; otherwise NgModules — MATCH the existing pattern).
- Ionic Framework `[IONIC_VERSION]`.
- Capacitor `[CAPACITOR_VERSION]` for native features.
- TypeScript strict.
- RxJS for async; signals if already used in the host app.
- State management: `[STATE_MGMT]` (e.g., NgRx, Akita, Angular Signals, plain
  services). MIRROR the Sales module — do not introduce a new state library.
- HTTP: Angular HttpClient with the existing interceptors
  (auth, error, retry, telemetry). Reuse them.
- Authentication: existing auth service used by the Sales module
  (likely `@azure/msal-angular` for Entra ID).
- Barcode scanning: `@capacitor-mlkit/barcode-scanning` (preferred) or
  whatever plugin the existing app already uses.
- Offline storage: `@ionic/storage-angular` or SQLite (`@capacitor-community/sqlite`)
  — MATCH existing.
- Forms: Angular Reactive Forms (FormBuilder).
- i18n: existing translation framework (`@ngx-translate/core` or Angular i18n).
- Testing: Karma + Jasmine (or Jest if that's what the app uses) + Cypress
  for e2e (if present).

## ENGINEERING STANDARDS

- TypeScript strict mode, no `any` without justification.
- Every screen has loading, error and empty states.
- All API calls via typed services; never call `HttpClient` from a component.
- Every user-facing string goes through the i18n framework — no hardcoded
  strings, ever.
- Every new screen ships with at least one unit test and one component test.
- Follow the existing ESLint / Prettier / commitlint rules — do not change them.
- Audit log on every posting transaction: user, device, timestamp,
  reference (PO#, SO#, RMA#, etc.).
- All async actions show a loading indicator and disable submit buttons.

## FOLDER CONVENTION (inside the inventory module)

```
src/app/modules/inventory/
├── inventory.module.ts          (or inventory.routes.ts if standalone)
├── inventory-routing.module.ts
├── pages/                        (one folder per transaction screen)
│   ├── inventory-home/
│   ├── po-receiving/
│   ├── customer-returns/
│   ├── ...one per US-XX...
│   └── shared/                   (shared sub-pages: scanner, qty-prompt)
├── components/                   (reusable UI: lp-card, qty-input, line-row)
├── services/                     (API services + business services)
│   ├── inventory-api.service.ts
│   ├── master-data.service.ts
│   ├── offline-queue.service.ts
│   └── ...one per transaction or grouped...
├── store/                        (state slices, only if app uses NgRx/etc.)
├── models/                       (TypeScript interfaces matching D365)
├── guards/                       (route guards, role checks)
├── utils/                        (validators, formatters, barcode parsers)
├── i18n/                         (translation keys for this module)
└── inventory.feature-flag.ts     (FF_INVENTORY_MODULE check)
```

## FEATURE FLAG

- Flag: `FF_INVENTORY_MODULE`, default `false`.
- Read from the existing config service.
- Used to: hide the module entry tile in the home screen AND lazy-load the
  routes.

## WORKING AGREEMENT

1. **Before any code change**, produce a short PLAN listing files to add or
   change, then wait for my approval.
2. Make small, reviewable commits with conventional-commit messages
   (e.g., `feat(inventory): add PO receiving screen`).
3. After each phase, run `npm run lint`, `npm test` (or the project's
   equivalent), and a production build; report the results.
4. NEVER modify code outside the inventory module path without asking first.
5. NEVER commit secrets; use environment files (`environment.ts` etc.).
6. When in doubt about a pattern, READ the Sales module first and copy
   what it does. Only deviate with a written reason.
7. If you find inconsistencies in the Sales module, flag them — don't
   propagate the bug.

## DELIVERABLES PER PHASE

- Source code on a feature branch `feature/inventory-phase-[N]`.
- Unit + component tests passing.
- A short PR description with: scope, screenshots/GIFs, test coverage,
  manual test notes, known limitations.
- Updated module README in `src/app/modules/inventory/README.md`.

---

When you understand, do these three things and stop:
1. Reply with `Ready`.
2. List the top-level folders you see in the existing repo.
3. Open and summarize (in 5-10 bullets) the Sales module structure so I can
   confirm we're aligned before Phase 0.
````

---

## 2. Phase Prompts

> Send one at a time, in order. Each one assumes the previous phase is merged.

---

### 2.0 · Phase 0 — Project Setup & Foundation

**Duration:** ~1 week · **Priority:** Critical

````
Execute PHASE 0: Project Setup & Foundation.

## GOAL
Create the inventory module skeleton inside the existing Angular/Ionic app,
gated by feature flag `FF_INVENTORY_MODULE`. No transactional logic yet —
just the scaffolding, navigation, home screen and one smoke test.

## TASKS

1. **Read the Sales module** at `[SALES_MODULE_PATH]`. Produce a short
   "patterns I will copy" list: routing style (lazy module vs standalone
   routes), service injection pattern, state management approach, page
   structure, styling approach.

2. **Create folder structure** under `[INVENTORY_MODULE_PATH]` exactly
   matching the layout in the Master Prompt. Add a `README.md` describing
   each folder.

3. **Feature flag**: add `FF_INVENTORY_MODULE` to the existing config
   service (default `false`). Document where it is read from.

4. **Routing**:
   - If app uses lazy NgModules → add `loadChildren: () => import(...)` for
     the inventory module behind the feature flag.
   - If app uses standalone routes → register the inventory routes the same
     way Sales does.

5. **Home screen** (`InventoryHomePage`):
   - Ionic page with a grid of tiles, one per US-XX transaction.
   - Each tile routes to a placeholder page that just shows the
     transaction name + "Coming soon".
   - Tiles must be large (warehouse operators wear gloves) — min 100×100 px
     touch area.
   - Localize all titles via the existing i18n framework.

6. **Navigation entry**: add an "Inventory" tab / menu item to the host
   app's main navigation, visible ONLY when `FF_INVENTORY_MODULE` is true.

7. **i18n**: create `i18n/inventory.en.json` (and other languages the host
   app supports) with all keys used in the home screen.

8. **Smoke test**: a unit test that mounts `InventoryHomePage` and asserts
   13 tiles render.

9. **Do NOT** install heavy new dependencies in this phase. If something
   seems missing (e.g., a barcode scanner), just stub it — we install in
   Phase 2.

## VERIFICATION

Run and report results:
- `npm run lint`
- `npm test` (filter to inventory)
- `npm run build --configuration=production`
- Manual: toggle `FF_INVENTORY_MODULE=true` → confirm the Inventory tab
  appears and home screen renders 13 tiles.
- Manual: toggle to `false` → confirm the tab disappears and the route is
  not reachable.

## OUTPUT
1. The "patterns I will copy" list from task 1.
2. PR-style summary: files added, files changed, tests written.
3. Screenshot of the home screen (or describe it if you can't take one).
````

---

### 2.1 · Phase 1 — Authentication & API Client Foundation

**Duration:** 1-2 weeks · **Priority:** Critical

````
Execute PHASE 1: Authentication & API Client Foundation.

Note: most of the auth plumbing should already exist in the host app
(Sales uses it). The goal here is to REUSE it and create the typed API
client for the inventory module.

## GOAL
Ensure the inventory module can call the backend with the existing auth
flow, and create a typed `InventoryApiService` that all later phases use.

## TASKS

1. **Audit existing auth**: open the auth service used by Sales. Confirm:
   - login / logout flow,
   - token storage,
   - silent refresh,
   - HttpClient interceptor that injects the Bearer token,
   - error handling (401 → refresh → retry; 403 → toast; 5xx → retry).
   Document any gap and surface it — do not silently fix it here.

2. **Inventory API base service**:
   - Create `InventoryApiService` at `services/inventory-api.service.ts`.
   - Wraps `HttpClient`, exposes typed methods per endpoint group.
   - All endpoints live under `${environment.apiBaseUrl}/inventory/*`.
   - Backend base URL comes from `environment.ts` — do NOT hardcode.

3. **Error handling**:
   - Add an Inventory-specific error interceptor or piggyback on the global
     one to map D365-style errors (e.g., "InfoLog" messages) to user-friendly
     toasts.
   - Surface the actual D365 error message; never swallow it.

4. **Telemetry**: ensure the existing telemetry SDK (App Insights / Sentry /
   whatever Sales uses) tags inventory calls with `module=inventory` and
   the transaction name (e.g., `transaction=PO_RECEIVING`).

5. **Profile screen**:
   - Add `InventoryProfilePage` (settings page for the module).
   - Shows: current user, warehouse, role, app version, last sync time,
     `Refresh master data` and `Logout` buttons.
   - Wire `Logout` to the existing auth service's logout.

6. **Guards**:
   - `InventoryAuthGuard`: blocks unauthenticated access to inventory routes.
   - `WarehouseSelectedGuard`: blocks transactional pages until a warehouse
     is selected (selection screen to be built in Phase 2).

7. **Tests**:
   - Unit test for `InventoryApiService` with mocked HttpClient.
   - Unit test for both guards (allow / block scenarios).

## VERIFICATION
- Manual login → reach Inventory home → open Profile → see user info.
- Force token expiry (or kill token) → call any endpoint → confirm silent
  refresh (or graceful re-login).
- Airplane mode → call endpoint → confirm graceful error toast.
- `npm run lint`, `npm test`, production build all green.

## OUTPUT
- Auth audit notes (any gaps found).
- PR summary.
- A sequence diagram (ASCII OK) of the auth flow as it applies to
  inventory.
````

---

### 2.2 · Phase 2 — Master Data Sync & Inventory Lookup

**Duration:** ~2 weeks · **Priority:** Critical

````
Execute PHASE 2: Master Data Sync & Inventory Lookup.

## GOAL
Provide read-only access to master data (warehouses, locations, items, LPs,
batches, serials) and on-hand inquiry. Cache locally for offline browsing.
Build the reusable barcode scanner component used everywhere later.

## TASKS

1. **Models** in `models/`:
   - `Warehouse`, `Location`, `Item`, `UnitOfMeasure`, `LicensePlate`,
     `Batch`, `Serial`, `OnHandRecord`, `DispositionCode`, `ReasonCode`.
   - All fields typed; nullable fields explicitly `?`.

2. **API endpoints** in `inventory-api.service.ts`:
   - `getWarehouses()`
   - `getLocations(warehouseId)`
   - `searchItems(query, limit, offset)`
   - `getItem(itemId)`
   - `getOnHand(filter: { itemId?, warehouseId?, locationId?, batch?, serial? })`
   - `getLicensePlate(lpId)`
   - `getReasonCodes()`, `getDispositionCodes()`

3. **Local cache** using `[STORAGE_PLUGIN]` (match what Sales uses; SQLite
   if available, else Ionic Storage):
   - Tables / keys for: warehouses, locations, items, UoMs, reason codes,
     disposition codes.
   - Items table indexed by itemId and barcode for fast lookup.

4. **MasterDataService**:
   - `syncAll()` — full sync on first login or manual refresh.
   - `syncDelta()` — delta sync if last sync > `[TTL_HOURS]` ago.
   - `findItemByBarcode(barcode): Observable<Item | null>` — local first,
     fallback to API.
   - `findLocation(warehouseId, locationId)` — local lookup.
   - Show a progress modal during full sync.

5. **Warehouse selector**:
   - On first login (or via Profile page), user picks active warehouse.
   - Persisted; used as default in every transaction.

6. **Barcode scanner component** at `components/scanner/`:
   - Inputs: `placeholder`, `allowManual` (default true), `barcodeType[]`
     (filter).
   - Output: `(scanned: string)` event.
   - Uses Capacitor barcode plugin; manual-entry fallback as an Ion-Input.
   - Provides audible beep + haptic feedback on successful scan.
   - Releases camera resources on `ngOnDestroy`.
   - Also works with HID Bluetooth scanners (capture keystrokes ending in
     Enter into a hidden input).

7. **Pages**:
   - `ItemSearchPage` — scan or type → list results → tap to detail.
   - `ItemDetailPage` — item info + on-hand breakdown by warehouse /
     location / batch / serial.
   - `LocationInquiryPage` — scan location → see contents.
   - `LicensePlateInquiryPage` — scan LP → see contents, status, location.

8. **Tests**:
   - Unit tests for MasterDataService (sync, lookup, fallback).
   - Component test for ScannerComponent (manual entry path).
   - Integration test: ItemSearchPage with mocked service.

## VERIFICATION
- First login → progress modal → master data downloaded and cached.
- Scan a known item barcode → ItemDetailPage shows correct on-hand.
- Scan an LP → LicensePlateInquiryPage shows contents.
- Airplane mode → previously synced data still browsable; uncached items
  show a clear "not available offline" message.
- `npm run lint`, `npm test`, build all green.

## OUTPUT
- PR summary.
- A short note on cache sizes (rows / MB) for a typical warehouse.
- Screenshots/GIFs of the four new pages.
````

---

### 2.3 · Phase 3 — Inbound Transactions (US-01 PO Receiving, US-07 Customer Returns)

**Duration:** ~3 weeks · **Priority:** High

````
Execute PHASE 3: Inbound Transactions.

Implements US-01 (PO Receiving) and US-07 (Customer Returns) end-to-end,
with label printing.

Before you start: re-read `[USER_STORIES_DOC_PATH]` for US-01 and US-07.

## GOAL
Operator can:
- receive a full or partial PO from the device, including batch/serial/expiry
  capture, LP creation, put-away suggestion, and label printing;
- receive a customer return against an RMA with disposition routing.

## TASKS

1. **Models** (add to `models/`):
   - `PurchaseOrder`, `PurchaseOrderLine`, `ReceiptDraft`, `ReceiptLineDraft`.
   - `ReturnOrder`, `ReturnLine`, `Disposition`, `ConditionCode`.

2. **API endpoints**:
   - `getOpenPOs(warehouseId)`, `getPOLines(poId)`, `postPOReceipt(payload)`.
   - `getOpenRMAs(warehouseId)`, `getRMALines(rmaId)`, `postRMAReceipt(payload)`.
   - `getSuggestedPutAway(receiptId)`.

3. **PO Receiving flow** (`po-receiving/` page):
   - Step 1: Scan/enter PO → show header (vendor, ETA, status).
   - Step 2: Lines list with received vs remaining indicators.
   - Step 3: Pick a line → ReceiptCapturePage:
       - Qty + UoM (with conversion),
       - Batch / Serial / Expiry / Country of Origin (per item config),
       - LP scan or auto-generate,
       - Notes / photo (optional).
   - Step 4: Suggested put-away location → operator confirms or overrides.
   - Step 5: Post → toast + return to lines list.
   - Show progress indicator during posting; disable submit to prevent
     double-post.

4. **Customer Returns flow** (`customer-returns/` page):
   - Scan/enter RMA → header + lines.
   - Per line: capture qty, condition (Good / Damaged / Defective),
     disposition (Stock / Quarantine / Scrap / Inspection).
   - Photos optional (Capacitor Camera).
   - Suggested location depends on disposition.
   - Post → confirm.
   - Items not on RMA → require supervisor PIN to receive (configurable).

5. **Exception handling** (BOTH flows):
   - Over-receipt: check tolerance from PO setup; block or warn.
   - Short receipt: allowed; mark line as partial; remains open.
   - Damaged / defective: mandatory reason code; routes to Quarantine.

6. **Label printing**:
   - Create `PrinterService` abstraction.
   - First implementation: `[PRINTER_VENDOR]` (e.g., Zebra Link-OS via
     Bluetooth using `@capacitor-community/bluetooth-le` or vendor SDK).
   - `PrinterService.printLpLabel(lp, item, qty)` returns Observable<boolean>.
   - Settings page: pair / unpair printer, test print.

7. **Audit log**: emit a structured log event on every post (success and
   failure) with: user, warehouse, PO/RMA #, lines posted, latency.

8. **Tests**:
   - Service tests for posting flows with mocked errors (over-receipt,
     period closed, missing batch).
   - Component test for ReceiptCapturePage validation rules.
   - One end-to-end integration test: full happy-path PO receipt.

## ACCEPTANCE (from US-01 and US-07)
- Cannot receive more than `Remaining Qty + over-delivery tolerance`.
- Batch/serial enforced when item is tracked; cannot post without them.
- LP created and visible in inquiry immediately after post.
- RMA dispositioned to Quarantine flags the location as blocked for ATP.
- Posting failures show the actual D365 error and do NOT commit.

## VERIFICATION
- Receive a real PO end-to-end against `[D365_DEV_ENV]`.
- Receive a return with three disposition variants (Stock, Quarantine, Scrap).
- Print a label on the paired Bluetooth printer.
- Negative tests: over-qty, missing batch, closed period.

## OUTPUT
- PR summary + recorded demo (or step-by-step screenshots).
- Known limitations and TODO items deferred to later phases.
````

---

### 2.4 · Phase 4 — Outbound Transactions + Pick & Put Engine

**Duration:** ~3 weeks · **Priority:** High

````
Execute PHASE 4: Outbound Transactions.

Implements US-12 (Pick & Put reusable engine), US-06 (Sales Order Shipment),
US-13 (Packing), US-08 (Vendor Returns).

## GOAL
Build a reusable Pick & Put engine, then use it for Sales picking and
Vendor Return picking. Add Packing and Ship Confirm flows.

## TASKS

1. **Models**: `Work`, `WorkLine`, `Load`, `Shipment`, `Container`,
   `CartonLabel`.

2. **API endpoints**:
   - `getMyWork(workPool, type?)`, `acceptWork(workId)`, `releaseWork(workId)`.
   - `submitPick(payload)`, `submitPut(payload)`.
   - `getLoad(loadId)`, `addToLoad(loadId, containerId)`.
   - `openContainer(loadId, containerType)`, `packItem(containerId, payload)`,
     `closeContainer(containerId)`.
   - `shipConfirm(loadId)`.

3. **Pick & Put engine** (`services/pick-put-engine.service.ts`):
   - State machine: `Idle → WorkAssigned → AtPickLocation → ItemScanned →
     QtyConfirmed → AtPutLocation → Completed`.
   - Each state has allowed actions and validation rules.
   - Reusable across Sales, Transfer, Production, Replenishment work.
   - Exposes Observables for UI binding.

4. **Generic Pick & Put pages**:
   - `WorkListPage` (system-directed or user-directed, filterable by type).
   - `PickPage` — driven by the engine (current location, item, qty, LP).
   - `PutPage` — destination location confirmation.

5. **Sales Order Shipment** (`so-shipment/`):
   - Uses WorkList filtered to Sales picking.
   - After picking, Sales work is auto-routed to packing or staging based
     on setup.
   - `LoadingPage`: scan dock + load → confirm.
   - `ShipConfirmPage`: review summary → confirm → posts packing slip.

6. **Packing** (`packing/`):
   - `PackingPage`: open container (carton/pallet), scan items, see running
     weight / volume vs container max.
   - Close container → prints SSCC carton label (GS1-128).
   - Reopen requires supervisor PIN.

7. **Vendor Returns** (`vendor-returns/`):
   - Uses Pick & Put engine with `workType=VendorReturn`.
   - Mandatory reason code on each line.
   - Final step: Ship Confirm.

8. **Short pick / exceptions**:
   - Operator chooses exception code (Damaged, Missing, etc.).
   - Optional replenishment trigger if configured.

9. **Tests**:
   - Engine state machine: cover happy path + 5 exception paths.
   - Packing weight/volume guardrails.
   - SSCC barcode validity check (mod-10).
   - Integration test: full SO pick → pack → ship confirm.

## ACCEPTANCE (US-06, US-08, US-12, US-13)
- Picked qty ≤ reserved qty (or short pick with exception).
- Ship Confirm fails if load is incomplete.
- Carton labels print valid GS1-128 SSCC barcodes.
- All movements traceable via LP history.

## VERIFICATION
- Full SO end-to-end (pick → pack → ship) against `[D365_DEV_ENV]`.
- Vendor Return shipment posts.
- 3 short-pick scenarios with different exception codes.

## OUTPUT
- PR summary.
- State machine diagram (ASCII or image) of the Pick & Put engine.
- Recorded demo of one full SO outbound.
````

---

### 2.5 · Phase 5 — Internal Movement (US-03 Transfer, US-02 Production Issue)

**Duration:** 2-3 weeks · **Priority:** High

````
Execute PHASE 5: Internal Movement Transactions.

Reuse the Pick & Put engine from Phase 4 for Warehouse Transfer and
Issue to Production.

## GOAL
- Operator can ship a Transfer Order from Warehouse A and receive it at B,
  with in-transit visibility in between.
- Operator can issue components to a Production Order with consumption
  posting.

## TASKS

1. **Models**: `TransferOrder`, `TransferLine`, `ProductionOrder`,
   `BomComponent`, `ConsumptionDraft`.

2. **API endpoints**:
   - `getOpenTransfers(from?, to?)`, `getTransferLines(transferId)`.
   - `postTransferIssue(payload)`, `postTransferReceipt(payload)`.
   - `getInTransit(warehouseId)`.
   - `getProductionPickWork(workerId)`, `postProductionConsumption(payload)`.

3. **Transfer Issue page**:
   - Scan transfer order → show lines → use Pick & Put engine to pick from
     source location → drop at outbound staging → post Transfer Issue.
   - In-transit qty visible immediately on both warehouses' on-hand views.

4. **Transfer Receipt page**:
   - Scan inbound LP or transfer number at destination warehouse.
   - System suggests put-away location.
   - Post Transfer Receipt; decrements in-transit.
   - If qty mismatch, log a transfer difference for investigation.

5. **Production Picking page**:
   - List open picking work for Production Orders.
   - Enforce reservation rules (FEFO / FIFO) per item policy.
   - Capture batch/serial.
   - Post against Production Order; consumption updates estimated vs actual
     material cost in D365.
   - Backflush items auto-consume per BOM config.

6. **In-Transit Inquiry page** (read-only).

7. **Tests**:
   - Transfer A → B reconciliation tests.
   - Production consumption with backflush.
   - Reservation guard tests (cannot pick from another reservation).

## ACCEPTANCE (US-02 and US-03)
- Cannot ship more than open transfer qty.
- In-transit visible between issue and receipt.
- Production consumption posts against the order.
- Short pick triggers exception code; optional replenishment.
- Reservation rules respected.

## VERIFICATION
- End-to-end Transfer A → B; both sides reconcile.
- Issue components to a Production Order; consumption visible in D365.
- Reservation conflict scenario (two workers, same lot).

## OUTPUT
- PR summary.
- Demo recording of both flows.
````

---

### 2.6 · Phase 6 — Inventory Operations (US-04, US-05, US-09, US-10)

**Duration:** ~3 weeks · **Priority:** Medium

````
Execute PHASE 6: Inventory Operations.

Cycle Counting, Assembly/Disassembly, License Plate Management, Location
Management. Some flows are supervisor-only.

## GOAL
Deliver inventory-control transactions with proper permission gating and
audit trails.

## TASKS

1. **Cycle Counting** (`cycle-count/`):
   - Modes: Scheduled, Threshold, Spot, Zero-on-hand.
   - Blind count toggle (expected qty NEVER shown).
   - Variance tolerance config (qty % and/or value) — read from D365 setup.
   - If variance within tolerance → auto-post.
   - If variance exceeds tolerance → routed for supervisor review (separate
     page with approve / request-recount actions).
   - Posted via counting journal in D365.

2. **Assembly / Disassembly** (`assembly/`):
   - `AssemblyPage`: scan/select assembly order or parent item (ad-hoc),
     list components → pick each → confirm assembly location & LP → post.
   - `DisassemblyPage`: scan parent LP → system suggests component output
     locations → post reverse transaction.
   - Backflush components per BOM config.
   - Cost rollup respected per costing method (standard/FIFO/weighted avg).

3. **License Plate Management** (`license-plate/`):
   - `LpBuildPage`: create LP, scan items to associate.
   - `LpSplitPage`: source LP → qty to move → new LP.
   - `LpMergePage`: scan two LPs at same location → merge (with guardrails:
     same item, batch, status; supervisor override available).
   - `LpMovePage`: scan LP → destination location → post move.
   - `LpInquiryPage`: full history.
   - LP merge split must preserve batch/serial assignment.

4. **Location Management** (`location-mgmt/`, **supervisor-only**):
   - Create, Edit, Block, Unblock, Inquire actions.
   - Block requires reason code; blocked locations excluded from new work
     creation immediately.
   - Print location barcode after create (via PrinterService from Phase 3).
   - Edit attributes: capacity (qty / weight / volume), fixed-location
     items, location profile.

5. **Permission gating**:
   - Add `SupervisorGuard` for location management and variance approval.
   - Enforce on client (hide UI) AND on backend (return 403). Trust the
     backend; client check is just UX.

6. **Audit logging**:
   - Every action emits a structured log event with action, target,
     before/after values where applicable, user, timestamp.

7. **Tests**:
   - Variance escalation paths.
   - LP merge guardrails (mismatched items, batches → blocked unless
     supervisor override).
   - Permission denial paths (worker tries to block a location → blocked).
   - Cost roll-up sanity for assembly.

## ACCEPTANCE (US-04, US-05, US-09, US-10)
- Blind count NEVER reveals expected qty.
- Variance > tolerance routes to supervisor review.
- LP merge blocked when item/batch/status differs.
- Blocked locations excluded from new work creation.
- All location changes auditable.

## VERIFICATION
- Spot count with variance → supervisor approves → adjustment posts in D365.
- Build a kit; on-hand reflects component consumption and kit production.
- Block a location → confirm no new work targets it.
- LP merge attempted on mismatched batches → blocked with clear message.

## OUTPUT
- PR summary + demo recordings of each flow.
````

---

### 2.7 · Phase 7 — Reservation, Offline Mode & Hardening

**Duration:** ~2 weeks · **Priority:** Medium

````
Execute PHASE 7: Reservation, Offline Mode & Hardening.

Implements US-11 (Reservation & Release), adds full offline support for the
critical transactions, and hardens the module for production load.

## GOAL
- Reservation create/release works end-to-end.
- PO Receiving, Cycle Count, and Pick & Put work fully offline; queued
  transactions sync correctly on reconnect.
- Performance targets met on a low-end device.

## TASKS

1. **Reservation & Release page** (`reservation/`):
   - Scan/select order (SO / TO / Production / PO).
   - List lines with required, reserved, available qty.
   - Reserve qty (optionally specifying batch/serial/LP).
   - Release qty.
   - Conflict handling (optimistic locking) with clear retry UI.

2. **Offline queue** (`services/offline-queue.service.ts`):
   - Local store (SQLite or Ionic Storage) for pending transactions:
     PO receipts, cycle counts, picks, puts.
   - Each queued item has: id, type, payload, attempts, lastError,
     createdAt, status.
   - Background sync triggered by:
     - Connectivity restored (Capacitor Network plugin),
     - App resume,
     - Manual "Sync now" button on Profile page.
   - Exponential backoff for retries.
   - Conflict resolution UI: per-transaction outcome (success / conflict /
     failed). For conflicts, show side-by-side current vs queued and let
     user retry or abandon.

3. **UI changes for offline**:
   - Persistent offline banner when disconnected.
   - Each transaction page shows "Will queue offline" indicator if
     disconnected.
   - Disable transactions that cannot work offline (e.g., reservation).

4. **Performance**:
   - Virtualize long lists (`ion-virtual-scroll` or CDK virtual-scroll).
   - Lazy-load images.
   - Trim API payloads (request only fields used by the UI).
   - Profile a cold start; target < 3 s on `[TARGET_DEVICE]`.

5. **Accessibility**:
   - Min 48×48 px touch targets.
   - All interactive elements have ARIA labels.
   - Test with large-fonts mode and screen reader.

6. **Localization**:
   - Confirm 100% of inventory strings are externalized.
   - Add `[SECONDARY_LANG]` translation file if not present.

7. **Telemetry**:
   - Every transaction emits a success/failure event with latency.
   - Custom dashboard query suggestions in `README.md`.

8. **Tests**:
   - Offline queue: queueing, syncing, conflict handling, idempotency.
   - Performance regression test (cold start time captured in CI if
     possible).

## ACCEPTANCE
- Reservation cannot exceed available qty; cannot reserve blocked batches.
- PO receipt completed in airplane mode syncs on reconnect.
- Cold start < 3 s; transaction round-trip < 1.5 s when online.
- All strings localized.
- Accessibility audit passes.

## VERIFICATION
- Airplane-mode test plan: receive a PO, complete a cycle count, complete a
  pick; reconnect; verify all sync correctly and inventory reflects them.
- Performance metrics captured and attached.

## OUTPUT
- PR summary.
- Offline test report.
- Perf metrics screenshot/table.
````

---

### 2.8 · Phase 8 — UAT, Stabilization & Go-Live

**Duration:** ~2 weeks · **Priority:** Critical

````
Execute PHASE 8: UAT, Stabilization & Go-Live.

## GOAL
Take the module through formal UAT, stabilize, and prepare production
release.

## TASKS

1. **UAT test plan**:
   - One test case per acceptance criterion across US-01..US-13.
   - Mapped in a single spreadsheet at `docs/inventory-uat-plan.xlsx`.
   - Each test case: precondition, steps, expected result, actual result,
     status, tester, date.

2. **UAT build**:
   - Set up a UAT channel (`[DISTRIBUTION_CHANNEL]` — e.g., App Center,
     TestFlight, Play Console internal).
   - Tag build with `inventory-uat-v1.0.0-rc[N]`.

3. **Defect triage**:
   - Track in `[DEFECT_TRACKER]`.
   - Severity: Blocker / High / Medium / Low.
   - Daily triage during UAT.

4. **Training materials**:
   - 1-page quick reference card per transaction (13 cards).
   - 3-5 minute screen recording per transaction.
   - "Day in the life" walkthrough video (10-15 min).
   - All assets in `docs/inventory-training/`.

5. **Load / soak test** (backend, if BFF exists):
   - Target: peak users × 3.
   - 95th-percentile latency < 800 ms.
   - Zero errors over a 1-hour soak.

6. **Production monitoring**:
   - Application Insights dashboard with: error rate, latency p95, txn
     volume by type, success rate per transaction.
   - Alerts: error rate > 1% over 5 min, latency > 2 s p95 over 5 min,
     auth failures spike.

7. **Rollout plan**:
   - Pilot warehouse for 2 weeks (10 users max).
   - Then phased rollout: 1 warehouse per week.
   - Rollback procedure documented.

8. **Support handover**:
   - Runbook: top 10 likely issues + resolution steps.
   - Escalation matrix (L1 → L2 → L3 → vendor).
   - Known issues list with workarounds.

## OUTPUT
- Signed UAT report.
- Production release notes.
- Support runbook.
- Go-live readiness checklist (signed off).
````

---

## 3. Per-prompt quick checklist (use before sending)

- [ ] Master prompt was sent at the start of this Claude Code session.
- [ ] All `[BRACKETS]` in this phase prompt are filled in.
- [ ] User Stories document (`[USER_STORIES_DOC_PATH]`) is available to Claude.
- [ ] Branch created: `feature/inventory-phase-[N]`.
- [ ] Previous phase merged to main.
- [ ] You're ready to review Claude's plan before code is written.

---

## 4. Placeholders cheat-sheet

| Placeholder | Example value |
|---|---|
| `[SALES_MODULE_PATH]` | `src/app/modules/sales/` |
| `[INVENTORY_MODULE_PATH]` | `src/app/modules/inventory/` |
| `[ANGULAR_VERSION]` | `17` |
| `[IONIC_VERSION]` | `7` |
| `[CAPACITOR_VERSION]` | `5` |
| `[STATE_MGMT]` | `NgRx` / `Akita` / `services + RxJS` |
| `[BACKEND_PATTERN]` | `existing .NET BFF` / `direct OData` |
| `[STORAGE_PLUGIN]` | `@capacitor-community/sqlite` / `@ionic/storage-angular` |
| `[USER_STORIES_DOC_PATH]` | `docs/Warehouse_Mobile_App_User_Stories.docx` |
| `[D365_DEV_ENV]` | `https://yourorg-dev.operations.dynamics.com` |
| `[PRINTER_VENDOR]` | `Zebra` / `Honeywell` / `TSC` |
| `[TARGET_DEVICE]` | `Zebra TC22` / `Honeywell CT45` / `Samsung XCover6 Pro` |
| `[SECONDARY_LANG]` | `ar` / `fr` / `es` |
| `[DISTRIBUTION_CHANNEL]` | `App Center` / `TestFlight` / `Play Console Internal` |
| `[DEFECT_TRACKER]` | `Jira` / `Azure DevOps` / `GitHub Issues` |
| `[TTL_HOURS]` | `4` |

---

## 5. Recommended commit / branch convention

- One branch per phase: `feature/inventory-phase-[N]-[short-name]`
  (e.g., `feature/inventory-phase-3-inbound`).
- Conventional commits: `feat(inventory): ...`, `fix(inventory): ...`,
  `test(inventory): ...`, `docs(inventory): ...`.
- Open the PR as a draft early; let Claude push small commits frequently.
- Squash-merge on PR close to keep `main` history clean.

---

## 6. Tips for working with Claude Code on this project

- **Always make Claude plan first.** Ask: "List the files you'll add or
  change, and any decisions you need from me, before writing code."
- **Force it to read the Sales module first.** That prevents stylistic
  drift and keeps the new module consistent.
- **Run tests after every meaningful change**, not just at the end.
- **If a phase grows too big**, stop and split it. Smaller PRs review faster
  and surface bugs earlier.
- **Reject scope creep.** If Claude suggests refactoring the Sales module
  or the host app, ask it to log the suggestion in a separate file
  (`docs/inventory-followups.md`) and continue.
- **D365 errors are gold.** Always surface the actual `InfoLog` message
  from D365 instead of a generic "Something went wrong" toast.
- **Test on a real device early**, especially camera scanning. The emulator
  lies.

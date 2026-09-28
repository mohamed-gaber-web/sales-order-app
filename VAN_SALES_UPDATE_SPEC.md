# Van Sales & Distribution — Mobile Update Spec (for Claude Code)

> **Audience:** Claude Code, running inside the existing Ionic + Angular mobile app repository.
> **Goal:** Extend the **Van Sales** module only, to match the approved Gap Analysis, API Catalogue and web simulation.
> **Owner:** Grow Path — D365 F&O Mobile (Van Sales)

---

## 0. Read this first — rules of engagement

1. **Scope is the Van Sales module only.** Do not change Inventory, Purchase Order, Sales Order (back-office), Return Order, Project, Production or WH Management (LP, Pick & Put) screens, services or routes. Shared code (auth, HTTP client, theme, storage) may be *extended*, never broken. If a shared change is unavoidable, stop and list it before editing.
2. **Discover before you build.** Step 1 (below) is mandatory. Follow the repo's existing conventions: standalone components vs NgModules, folder layout, state pattern (services + RxJS / signals / NgRx), naming, lint rules, i18n approach, theming variables.
3. **Reuse what exists.** The app already has: route list + map, GPS check-in, Sell from van stock, Collect (cash / single cheque), Return against invoice, No-sale reasons, New customer request, Sync & Day close, Transfer order receive, Barcode count, On-hand. Extend these; do not duplicate them.
4. **No backend changes.** The D365 X++ services may not all exist yet. Every new call goes through an API adapter with a **mock implementation** switchable by an environment flag (see §6.4).
5. **No hard-coded business values.** Limits (discount %, free-return limit, geofence radius), promotions, surveys, loyalty rules and VAT come from master data (see §5). Demo values in this spec are defaults for mocks only.
6. **Work in phases (§10) and stop at each checkpoint** with: summary of changes, files touched, how to test, open questions.
7. Keep the build green: `ng lint`, unit tests, and `ionic build` must pass at every checkpoint.

---

## 1. Step 1 — Discovery (do this before any code)

Produce `docs/van-sales/DISCOVERY.md` with:

- App structure: Angular version, Ionic version, Capacitor version, standalone vs modules, routing file(s) for Van Sales.
- Van Sales pages/components that exist today and their routes (map each to the screens in §7).
- HTTP layer: base URL config, auth (Entra ID / MSAL / token interceptor), error handling, retry.
- Offline layer: which storage is used (Ionic Storage, SQLite, IndexedDB, none), whether an outbox/queue already exists, how "Sync & day close" posts today.
- Existing D365 calls made by Van Sales (entity names / service paths) — list them against the API numbers in §6.
- Installed Capacitor plugins (Geolocation, Camera, Network, Bluetooth / printer, Filesystem, Share).
- Models/interfaces for Customer, Product, Invoice, Collection, Return, Visit.
- Test setup (Karma/Jasmine or Jest), lint config.

Then propose the file plan for the changes (new/modified files) and **wait for approval**.

---

## 2. Feature scope

| # | Feature | Status today | Priority |
|---|---|---|---|
| F1 | Role-based Van Sales (Van seller, Pre-seller, Delivery rep, Collector) + Supervisor approvals view | Single role | P1 |
| F2 | Pricing & promotions engine (price groups, tier, FOC, mix & match, invoice discount, manual discount limit) | Unit price only | P1 |
| F3 | Credit control (limit, overdue, bounced cheque hold, override request) | Display only | P1 |
| F4 | Free return (no invoice) + limit + approval; reason → disposition | Return against invoice only | P1 |
| F5 | Multi-cheque collection + e-wallet; oldest-first settlement | Cash / single cheque | P1 |
| F6 | Cheque lifecycle (With rep → Treasury → Deposited → Cleared / Bounced) | None | P1 |
| F7 | E-Receipt (B2C) / E-Invoice (B2B) status + QR on receipt | None | P1 |
| F8 | Pre-sales orders and Delivery with POD (signature, partial delivery, reject reason) | None | P1 |
| F9 | Offline outbox with idempotent sync | Partial (outbox view exists) | P1 |
| F10 | Thermal print + share PDF of invoice / receipt / return | Not visible | P1 |
| F11 | Shelf survey / questionnaire with photos | None | P2 |
| F12 | Loyalty points (earn, redeem, tier) | None | P3 |
| F13 | Geofence override request | Check-in only | P2 |
| F14 | Day close extensions (cash + cheques handover, damaged stock, unload, KPIs) | Basic | P1 |

---

## 3. Roles and permissions (F1)

Role comes from **API #12 Rep & Van Setup** after login. Never trust a client-side toggle in production; a dev-only role switcher is allowed behind `environment.devTools`.

| Role | Visit actions | Cannot | Needs approval for |
|---|---|---|---|
| `VAN_SELLER` | Sell/Invoice, Collect, Return, Survey, No sale | Change prices | Extra discount > limit, credit override, free return > limit |
| `PRE_SELLER` | Take order, Survey, No sale | Deliver, invoice, collect | Extra discount > limit, credit override |
| `DELIVERY_REP` | Deliver order, Collect, Return, No sale | Create new orders (unless setup allows) | Free return > limit |
| `COLLECTOR` | Collect, No sale | Sell, return | — |
| `SUPERVISOR` | Approvals, Cheques, E-documents tabs | Financial posting | — |

Implementation:
- `VanSalesRoleService` exposes `role$`, `can(action): boolean`.
- Route guards on Van Sales child routes; visit action grid built from `can()`.
- Home list filter: Collector sees customers with balance > 0; Delivery rep sees customers with orders to deliver.

---

## 4. Data models (TypeScript)

Adapt names to the repo's conventions. Put under the Van Sales feature folder, e.g. `van-sales/models/`.

```ts
export type Role = 'VAN_SELLER' | 'PRE_SELLER' | 'DELIVERY_REP' | 'COLLECTOR' | 'SUPERVISOR';
export type PayMode = 'CASH' | 'CREDIT';
export type TaxDocKind = 'E_INVOICE' | 'E_RECEIPT' | 'E_CREDIT_NOTE' | 'E_RECEIPT_RETURN';

export interface RepSetup {            // API #12
  repId: string; workerName: string; role: Role; vanWarehouse: string; mainWarehouse: string;
  routeId: string; supervisorId: string;
  manualDiscountLimitPct: number;      // default 3
  freeReturnLimitPerVisit: number;     // incl. VAT, default 1000
  geofenceRadiusM: number;             // default 100
  deviceSerial: string;                // ETA POS serial for e-receipts
  docNumberSeqPrefix: { invoice: string; order: string; return: string; receipt: string };
}

export interface Customer {            // API #1, #2, #18, #19, #22
  id: string; name: string; address: string; lat?: number; lon?: number;
  priceGroup: string;                  // Retail | Wholesale | Key account ...
  taxId?: string;                      // present => E-Invoice, absent => E-Receipt
  paymentTerms: 'CASH' | 'CREDIT';
  creditLimit: number; overdue: boolean; creditHold: boolean;  // hold = bounced cheque etc.
  openInvoices: OpenInvoice[];
  loyalty?: { points: number; tier: string };
}
export interface OpenInvoice { invoiceId: string; date: string; dueDate?: string; amount: number; } // remaining

export interface JourneyStop {         // API #13
  customerId: string; sequence: number; eta?: string; windowFrom?: string; windowTo?: string; priority?: 'HIGH' | 'NORMAL';
}

export interface PromotionRule {       // API #14
  id: string; type: 'LINE_TIER' | 'FOC' | 'MIX_MATCH' | 'INVOICE_THRESHOLD';
  validFrom: string; validTo: string; customerGroups?: string[];
  itemIds?: string[]; minQty?: number; discountPct?: number;
  buyQty?: number; freeQty?: number; freeItemId?: string;       // FOC
  minEachQty?: number;                                          // MIX_MATCH (all itemIds)
  minNetAmount?: number;                                        // INVOICE_THRESHOLD
  budgetRemaining?: number;
}

export interface CartLine { itemId: string; qty: number; unit: string; }
export interface PricedLine { itemId: string; qty: number; freeQty: number; unitPrice: number; gross: number; lineDiscount: number; promoIds: string[]; promoLabel?: string; }
export interface PricingResult {
  lines: PricedLine[]; gross: number; lineDiscount: number; invoiceDiscount: number;
  manualDiscountPct: number; manualDiscount: number; redeemedPoints: number; redeemedValue: number;
  net: number; vat: number; total: number; pointsToEarn: number; appliedPromoIds: string[];
}

export interface Cheque { bank: string; number: string; dueDate: string; amount: number; photoPath?: string; }
export type ChequeStatus = 'WITH_REP' | 'HANDED_TO_TREASURY' | 'DEPOSITED' | 'CLEARED' | 'BOUNCED';

export interface ApprovalRequest {
  id: string; type: 'EXTRA_DISCOUNT' | 'CREDIT_OVERRIDE' | 'FREE_RETURN' | 'GEOFENCE_OVERRIDE';
  customerId: string; repId: string; detail: string; payload: unknown;
  status: 'PENDING' | 'APPROVED' | 'REJECTED'; createdAt: string;
}

export interface OutboxItem {
  mobileTransId: string;               // UUID v4, generated once, never regenerated
  apiNo: number; endpoint: string; body: unknown;
  createdAt: string; attempts: number; lastError?: string;
  status: 'QUEUED' | 'SENDING' | 'POSTED' | 'FAILED';
  d365DocumentId?: string;             // filled from response
  dependsOn?: string[];                // e.g. attachments depend on the parent document
}
```

---

## 5. Master data & configuration

Pull on login and on "Refresh", as **delta** using `ModifiedDateTime gt <lastSync>` where the entity supports it. Store locally for offline use.

| Data | API | Used by |
|---|---|---|
| Rep setup (role, limits, van, device serial) | #12 | Roles, limits, numbering, ETA |
| Journey plan | #13 | Home stop list |
| Customers, addresses, groups | #1, #2, #3 | Visit, pricing, geofence |
| Products, barcodes, UoM conversions | #5, #6, #7 | Sell, scan, cartons |
| Price & discount agreements | #8 | Pricing engine |
| Tax groups / VAT rate | #9 | Pricing engine |
| Return reason codes (+ disposition, sellable flag) | #10 | Return |
| Warehouses | #11 | Van / main warehouse |
| Promotions | #14 | Pricing engine |
| Survey definitions | #15 | Survey |
| Loyalty rules | #16 | Points |
| Banks list | #17 | Cheques |
| Van on-hand | #20 | Stock checks |

Reason code config must include `disposition` and `sellable` (sellable → back to van stock; not sellable → damaged/quarantine bucket).

---

## 6. API layer

### 6.1 Conventions

- Base URL and auth: reuse the existing HTTP client/interceptor.
- **Standard OData** (`/data/...`): GET with `$filter`, `$select`, `cross-company=true` if the app already uses it.
- **Custom services**: `POST /api/services/VSServices/{Service}/{operation}`. D365 JSON services expect the body keyed by the contract parameter name — use a wrapper, default `{ "_request": { ... } }`. Put the wrapper key in one constant so the backend team can change it.
- Every write carries `MobileTransId` (UUID). Backend must treat a repeated `MobileTransId` as idempotent and return the original document id.
- Standard response envelope for custom services (confirm with backend; adapt in one mapper):

```json
{ "Success": true, "Message": "", "MobileTransId": "…", "DocumentId": "VI-11-0001", "Duplicate": false, "Data": {} }
```

### 6.2 Endpoint catalogue (numbers match the API document)

**Type:** Standard = existing D365 entity/feature · Custom = new X++ service or entity · External = outside D365.
**Mode:** Pull (cache for offline) · Online (needs network, falls back to cache) · Queue (goes through outbox).

| # | Name | Type | Method & path | Mode |
|---|---|---|---|---|
| 1 | Customers | Standard | GET `/data/CustomersV3` | Pull |
| 2 | Customer Addresses | Standard | GET `/data/CustomerPostalAddresses` | Pull |
| 3 | Customer Groups | Standard | GET `/data/CustomerGroups` | Pull |
| 5 | Products | Standard | GET `/data/ReleasedProductsV2` | Pull |
| 6 | Barcodes | Standard | GET item bar code entity | Pull |
| 7 | Unit Conversions | Standard | GET product UoM conversion entity | Pull |
| 8 | Price & Discount Agreements | Standard | GET `/data/SalesPriceAgreements` | Pull |
| 9 | Sales Tax Groups | Standard | GET tax group entities | Pull |
| 10 | Return Reason Codes | Standard | GET `/data/ReturnReasonCodes` | Pull |
| 11 | Warehouses & Sites | Standard | GET `/data/Warehouses` | Pull |
| 12 | Rep & Van Setup | Custom | GET `/data/VSRepSetups` | Pull |
| 13 | Journey Plan | Custom | GET `/data/VSJourneyPlans` | Pull |
| 14 | Promotions | Custom | GET `/data/VSPromotions` | Pull |
| 15 | Survey Definitions | Custom | GET `/data/VSSurveys` | Pull |
| 16 | Loyalty Rules | Custom | GET `/data/VSLoyaltyRules` | Pull |
| 17 | Banks List | Custom | GET `/data/VSChequeBanks` | Pull |
| 18 | Customer Open Invoices | Custom | POST `VSCustomerService/getOpenInvoices` | Online |
| 19 | Credit Check | Custom | POST `VSCustomerService/checkCredit` | Online |
| 20 | Van On-hand | Standard | GET warehouse on-hand entity | Pull |
| 21 | Sales Order History | Standard | GET `/data/SalesOrderHeadersV2` | Pull |
| 22 | Loyalty Balance | Custom | POST `VSLoyaltyService/getBalance` | Online |
| 23 | Price Verification | Custom | POST `VSPricingService/calculate` | Online (skip offline) |
| 24 | Create Sales Order | Custom | POST `VSSalesService/createOrder` | Queue |
| 25 | Post Van Invoice | Custom | POST `VSSalesService/postVanInvoice` | Queue |
| 26 | Confirm Delivery | Custom | POST `VSDeliveryService/confirm` | Queue |
| 27 | Return Against Invoice | Custom | POST `VSReturnService/postReturn` | Queue |
| 28 | Free Return / Swap | Custom | POST `VSReturnService/postFreeReturn` | Queue |
| 29 | Post Collection | Custom | POST `VSCollectionService/post` | Queue |
| 30 | Register Cheques | Custom | POST `VSCollectionService/registerCheque` | Queue |
| 31 | Load Request | Custom | POST `VSVanService/loadRequest` | Queue |
| 32 | Receive Load | Custom | POST `VSVanService/receiveTransfer` | Queue (exists today — reuse) |
| 33 | Van Unload | Custom | POST `VSVanService/unload` | Queue |
| 35 | New Customer Request | Custom | POST `/data/VSCustomerRequests` | Queue (exists today — reuse) |
| 36 | Visit Log | Custom | POST `/data/VSVisitLogs` | Queue |
| 37 | Survey Answers | Custom | POST `/data/VSSurveyAnswers` | Queue |
| 38 | Attachments | Custom | POST `VSAttachmentService/upload` | Queue (after parent) |
| 39 | Loyalty Transaction | Custom | POST `VSLoyaltyService/post` | Queue |
| 40 | Rep Expenses | Custom | POST `/data/VSRepExpenses` | Queue (P2) |
| 41 | Day Close | Custom | POST `VSDayCloseService/close` | Queue |
| 42 | Authentication | External | Entra ID OAuth 2.0 (existing) | Online |
| 43 | ETA E-Receipt | External | POST `{middleware}/eta/e-receipts` | Queue |
| 44 | ETA E-Invoice | Standard | D365 Electronic Invoicing — mobile only reads status | Online |
| 45 | Business Events | Standard | Push via middleware (approvals, bounced cheque) | Online |
| 46 | Sync Log | Custom | POST `/data/VSIntegrationLogs` | Online |
| 47 | Maps / Routing | External | Existing maps provider | Online |

> Entity names must be verified against the environment's `/data/$metadata`. Keep all paths in one `van-sales-endpoints.ts` constants file.

### 6.3 Key request bodies

**#25 Post Van Invoice**
```json
{ "_request": {
  "MobileTransId": "uuid", "InvoiceId": "VI-11-0001", "CustAccount": "CU-004512", "Warehouse": "VAN-11",
  "PaymentMode": "CASH",
  "Lines": [ { "ItemId": "1003", "Qty": 20, "FreeQty": 2, "UnitPrice": 14.50, "LineDisc": 0, "PromoIds": ["PR-FOC-PASTA"] } ],
  "InvoiceDiscount": 0, "ManualDiscountPct": 0, "ApprovalId": null,
  "RedeemedPoints": 0, "NetAmount": 290.00, "VAT": 40.60, "Total": 330.60,
  "TaxDocKind": "E_RECEIPT", "EtaUuid": "uuid", "Lat": 30.05, "Lon": 31.20
} }
```

**#24 Create Sales Order** — same line shape, plus `RequestedShipDate`, no stock deduction, no tax document.

**#26 Confirm Delivery**
```json
{ "_request": { "MobileTransId": "uuid", "SalesId": "SO-24031", "InvoiceId": "VI-11-0002", "CustAccount": "CU-004210",
  "PaymentMode": "CREDIT", "Lines": [ { "ItemId": "1002", "OrderedQty": 12, "DeliveredQty": 10 } ],
  "RejectReason": "Damaged in transit", "PODSigned": true, "Total": 889.20 } }
```

**#28 Free Return**
```json
{ "_request": { "MobileTransId": "uuid", "ReturnId": "RT-11-0001", "CustAccount": "CU-004877", "ReturnType": "Free",
  "ReasonCode": "RTN-DMG", "Disposition": "QUARANTINE", "ApprovalId": "APR-12",
  "Lines": [ { "ItemId": "1006", "Qty": 5, "Price": 35.00 } ], "ValueInclVAT": 199.50 } }
```
`#27` is the same with `ReturnType: "AgainstInvoice"` and `OriginalInvoice`.

**#29 Post Collection** (one call per receipt, any method)
```json
{ "_request": { "MobileTransId": "uuid", "ReceiptId": "RC-11-0001", "CustAccount": "CU-004512",
  "Amount": 12300.00, "PaymentMethod": "PDC",
  "Settlement": [ { "InvoiceId": "INV-87651", "Amount": 5760.00 }, { "InvoiceId": "INV-88103", "Amount": 6540.00 } ] } }
```
`PaymentMethod`: `CASH` | `PDC` | `E_WALLET` (+ `WalletRef`).

**#30 Register Cheques** (one call per receipt, array of cheques)
```json
{ "_request": { "MobileTransId": "uuid", "ReceiptId": "RC-11-0001", "CustAccount": "CU-004512", "Total": 12300.00,
  "Cheques": [
    { "ChequeNum": "100245", "Bank": "National Bank of Egypt", "MaturityDate": "2026-10-15", "Amount": 6000.00 },
    { "ChequeNum": "553102", "Bank": "CIB", "MaturityDate": "2026-11-15", "Amount": 6300.00 } ] } }
```

**#43 ETA E-Receipt** (via middleware; the mobile never calls ETA directly)
```json
{ "uuid": "uuid", "posSerial": "VAN-11-TAB", "receiptNumber": "VI-11-0001", "receiptType": "Sale",
  "buyerType": "P", "totalAmount": 330.60, "dateTimeIssued": "2026-09-23T10:12:00Z" }
```

**#36 Visit Log** events: `CheckIn`, `CheckInRejected`, `CheckOut`, `NoSale` (+ `Reason`), `GeofenceOverride`.

### 6.4 Adapter & mocks

- `VanSalesApi` interface → `VanSalesHttpApi` (real) and `VanSalesMockApi` (in-memory, seeded with the simulation data).
- Select via `environment.vanSalesApi = 'http' | 'mock'`; allow per-endpoint override (`mockEndpoints: number[]`) so real and mock can mix while X++ services are delivered.
- Mock must honour idempotency, credit rules and approval flow so the UI can be tested end-to-end.

---

## 7. Screens (changes per screen)

Match the existing visual style (navy header, orange primary action, cards). Keep English labels via the app's i18n mechanism; add Arabic keys if the app is bilingual.

### 7.1 Home / Today's stops
- Header KPIs: Visited / Sales / Collected (existing) + network pill **Online / Offline · N queued**.
- Stop card tags: visit outcome, `Credit hold`, `N to deliver` (Delivery rep), `E-Invoice` / `E-Receipt`.
- Role-based filtering (see §3). Buttons: Day close (existing).

### 7.2 Visit
- Card adds: price list group, tax document kind, loyalty tier + points, credit hold banner (overdue / bounced cheque).
- Check-in: if outside `geofenceRadiusM` → bottom sheet with distance and **Request supervisor override** (F13); actions stay locked until approved.
- Action grid from role (§3). Deliver shows count of pending orders.

### 7.3 Sell / Take order (F2, F3, F12)
- Payment toggle Cash / Credit (Credit hidden for cash customers).
- Promotions strip (active rules for this customer).
- Product row: price per piece for customer's group, van stock (invoice mode only), steppers `− / + / +ctn`, promo note under the line (`Buy 10, get 1 free`, `+2 free`).
- Summary: Gross, Promotions, Free items, Invoice discount, **Extra discount** select (limit from setup), **Redeem points** checkbox, Net, VAT, Total, Points to earn.
- Blocking issues shown inline: stock short, discount over limit, credit hold/limit.
  - Over limit → **Request X% discount approval** (disabled while pending).
  - Credit issue → **Request credit override** + **Switch to cash**.
- Post → receipt screen. Order mode → confirmation (no tax doc).

### 7.4 Collect (F5)
- Methods: **Cash**, **Cheques**, **E-wallet**.
- Cheques: list of cheque cards (bank, number, due date, amount, photo) with **Add another cheque**, **Remove**, **Fill remaining balance**. Total = sum of cheques.
- Validation: every cheque complete; no duplicate bank+number; total ≤ open balance; amount > 0.
- Settlement preview **oldest first**, partial flag, balance after.
- Post → #29 once, #30 once with all cheques, #38 per photo (depends on #29).

### 7.5 Return (F4)
- Toggle **Against invoice** / **Free return** (free return only for Van seller & Delivery rep).
- Against invoice: pick invoice → per-line qty up to invoiced qty.
- Free return: any product, priced at the customer's **last purchase price** (fallback: price list).
- Reason code select → shows disposition. Controls box (policy text from config).
- Free return value > `freeReturnLimitPerVisit` → **Request supervisor approval**; on approval the return posts automatically with `ApprovalId`.
- Sellable reasons add stock back to van; others go to the damaged bucket for unload.

### 7.6 Survey (F11)
- Render questions from #15: yes/no, choice, number, text, photo. Required questions block Save.
- Photos captured with GPS + timestamp → #38.

### 7.7 Deliver (F8)
- List of orders for the customer (status Ready / Delivered / Partially delivered).
- Delivery screen: delivered qty per line (≤ ordered), reject reason when short, payment toggle, **signature pad** (canvas component, required), total.
- Confirm → #26 then #38 (signature). Undelivered qty returns to van stock.

### 7.8 Receipt / Document (F7, F10)
- Paper-style preview: header, lines with promo notes, discounts, VAT, total, points.
- E-document block: kind, UUID, status (`Queued` until synced / `Valid` / `Submitted` / `Rejected`), QR code.
  - QR payload comes from middleware/ETA response; while offline show the UUID and a pending note — **do not invent a QR format**.
- **Print receipt** (Bluetooth thermal via existing or new `PrinterService`; stub if no plugin), **Share PDF**.
- Collection receipt lists each cheque. Return shows reason and disposition.

### 7.9 Sync & day close (F9, F14)
- Outbox counts by type + e-documents waiting.
- Hand-over: cash in box, cheques (count, total).
- Van stock to unload (sellable + damaged).
- KPIs: planned/visited, strike rate, sales, returns.
- If outbox not empty → **Go online and sync** first. Then **Close day** → #33, #41; cheques move to `HANDED_TO_TREASURY`; visit actions lock for the day.

### 7.10 Supervisor (F1, F6)
- Tabs: **Approvals** (approve/reject), **Cheques** (lifecycle timeline, next step, mark bounced when deposited), **E-documents** (status list).
- Bounce → customer `creditHold = true`, amount re-added to balance (backend is source of truth; UI reflects #45 event or refreshed #18/#19).

---

## 8. Business logic (pure services + unit tests)

### 8.1 `PricingEngineService` (pure, no I/O)
Order of application — must match D365 `VSPricingService/calculate` (#23):
1. Unit price = price agreement for item + customer price group (fallback: base price × group factor from config).
2. Line tier discount (`LINE_TIER`: qty ≥ minQty → discountPct).
3. FOC (`FOC`: floor(qty / buyQty) × freeQty, same or different item). Free qty consumes van stock.
4. Mix & match (`MIX_MATCH`: every item in `itemIds` qty ≥ `minEachQty` → discountPct on those lines).
5. Invoice threshold (`INVOICE_THRESHOLD`: subtotal after line discounts ≥ minNetAmount → discountPct).
6. Manual discount % on the amount after step 5 (blocked above limit unless approved).
7. Points redemption (rules from #16; cannot exceed remaining net).
8. VAT on net (rate from tax group). Round per line to 2 dp, totals to 2 dp.
9. Points to earn (rule from #16).

Respect `validFrom/validTo`, `customerGroups` and `budgetRemaining`. Online: call #23 before posting and show a warning if totals differ by > 0.01 (post with D365 values). Offline: post with local values; D365 re-validates.

**Required unit tests:** each rule alone, combinations, rounding, expired promo, budget exhausted, manual limit, redemption cap.

### 8.2 `CreditService`
- Block credit sale when `creditHold`, `overdue`, or `balance + total > creditLimit` (unless an approved override exists for this customer and visit).
- Refresh via #19 when online; otherwise use cached customer.

### 8.3 `SettlementService`
- Allocate an amount across open invoices oldest-first; supports partial; ignores credit notes (negative).

### 8.4 `ReturnService`
- Last purchase price lookup; limit check incl. VAT; disposition from reason code.

### 8.5 `ApprovalService`
- Create request (online: send; offline: queue), poll or receive #45 events, expose `approved(customerId, type)`; approvals expire at day close.

---

## 9. Offline outbox & sync (F9)

- Persist the outbox in the app's existing storage (prefer SQLite if present). Survive app restarts.
- Generate `MobileTransId` **once** at creation; retries reuse it.
- Document numbers: from the rep's reserved sequence (#12 prefixes) + local counter persisted per device.
- Process in FIFO with dependencies: attachments (#38), loyalty (#39) and e-receipt (#43) run after their parent document posts.
- Retry with exponential backoff; after 5 failures mark `FAILED` and show in Day close with the backend message.
- Listen to `@capacitor/network`; auto-sync when back online; manual **Sync now**.
- After each successful sync batch post #46 (Sync Log).
- Local stock, balances and points update immediately (optimistic); reconcile on next pull.

---

## 10. Delivery plan — phases & checkpoints

| Phase | Work | Checkpoint output |
|---|---|---|
| 0 | Discovery (§1) + file plan | `DISCOVERY.md`, proposed file list — **wait for approval** |
| 1 | Models, endpoints constants, API adapter + mock, outbox service | Unit tests for outbox & mock idempotency |
| 2 | Roles & guards, Rep setup load, home/visit updates, geofence override | Role switch works in dev; guards tested |
| 3 | Pricing engine + Sell/Order screen + credit control + discount/credit approvals | Pricing unit tests green; demo flows |
| 4 | Collect (multi-cheque, e-wallet) + settlement + receipt | Settlement tests; cheque validation tests |
| 5 | Returns (against invoice + free) + approvals | Limit & disposition tests |
| 6 | Pre-sales orders + Delivery with POD signature | Partial delivery flow |
| 7 | Receipt printing/sharing + E-document status block | Print stub or real printer |
| 8 | Day close extensions + Supervisor tabs (approvals, cheques, e-docs) | End-to-end offline → sync → close day |
| 9 | Survey (P2), Loyalty (P3) | — |

At each checkpoint: `ng lint`, `ng test`, `ionic build` green; list files changed; note any deviation from this spec.

---

## 11. Acceptance scenarios (must pass on the mock API)

1. **FOC:** 20 × Pasta → 2 free, stock reduced by 22, receipt shows the promo.
2. **Tier + threshold:** 48 × Tomato paste gets 5%; subtotal ≥ 5,000 gets extra 2%.
3. **Discount approval:** 5% extra → blocked → request → supervisor approves → posts with `ApprovalId`.
4. **Credit hold:** overdue customer, Credit → blocked; Switch to cash posts.
5. **Multi-cheque:** balance 12,300 → two cheques 6,000 + 6,300 with different due dates → one #29, one #30 with 2 cheques, two cheques appear in Supervisor as `With rep`.
6. **Duplicate cheque:** same bank + number twice → Post disabled with message.
7. **Bounced cheque:** Supervisor moves to Deposited → Mark bounced → customer on credit hold.
8. **Free return over limit:** 1,200 incl. VAT → approval → auto-post; damaged reason → quarantine bucket.
9. **Pre-sale → delivery:** Pre-seller creates order → Delivery rep delivers 10 of 12 with reason + signature → invoice + e-receipt; 2 back to van stock.
10. **Offline:** go offline, post invoice + collection + return → 3+ queued; go online → all posted once (no duplicates on retry).
11. **Day close:** blocked while outbox not empty; after sync, closes, cheques → Treasury, actions locked.
12. **E-document kind:** customer with tax ID → E-Invoice; without → E-Receipt; returns → credit note / return receipt.

---

## 12. Out of scope

- Any change to non-Van-Sales modules.
- D365 X++ services, entities and middleware (built by the backend team; mock until ready).
- Direct calls from the device to the ETA API.
- Route optimisation algorithms beyond what exists today.

## 13. Open questions to raise at Phase 0

1. Does the environment have a D365 Commerce licence? (If yes, promotions/loyalty may use standard Commerce instead of `VSPromotions` / `VSLoyaltyRules`.)
2. Approvals: in-app supervisor only, or D365 Workflow?
3. Which thermal printer model / Capacitor plugin is used in the field?
4. Is there a middleware (Azure API Management / Logic Apps) already, and its base URL?
5. Confirm custom service body wrapper key and response envelope.

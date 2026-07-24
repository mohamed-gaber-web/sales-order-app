# BUILD SPEC — Warehouse Mobile App for Dynamics 365 F&O

> **How to use this file**
> Give this whole file to Claude Code as the project brief. It is written to be executed top-to-bottom.
> **Do not start coding until §1 (Blockers) is answered by the human.** Those answers change the architecture.
>
> Language convention for this project: **all code, identifiers, comments, commits, and docs in English. All user-facing UI strings in Arabic (Egyptian dialect where noted).** Arabic copy in this spec is final and must be used verbatim — it has been reviewed. Do not translate, paraphrase, or "improve" it.

---

## 1. BLOCKERS — ask the human before writing any code

Print these as a numbered list and wait for answers. Each one changes what you build.

| # | Question | Why it matters |
|---|---|---|
| B1 | Is **Advanced Warehouse Management (WHS)** enabled? | If yes: work is driven by `WHSWorkTable`, location suggestions come from Location Directives, and screens 12/18/20 become "work execution" screens. If no: everything runs on Arrival journals, Picking lists, and Transfer orders directly. **This is the single biggest fork in the codebase.** |
| B2 | D365 version and deployment (cloud / on-prem)? | Determines OData availability, Business Events, and auth flow. |
| B3 | Who is allowed to **post** (vs register)? Named security roles. | Screens 08, 17, 19, 29, 32 gate on this. |
| B4 | Do suppliers use **GS1-128 / GTIN** barcodes? | If no, screen 05 needs a per-vendor barcode mapping table and a manual fallback path. |
| B5 | Is **Quality Management** module licensed and configured (Test groups, Item sampling, Quality associations)? | If not configured, module G must be built on a custom table set instead — significantly more work. |
| B6 | Are any items **catch weight** (variable weight)? | If yes, screens 12, 25, 31 need dual quantity (nominal + actual weight) everywhere. |
| B7 | Is **recall / backward traceability** in scope? | If yes, add screen 33 (batch → customers shipped) and index accordingly. |
| B8 | Target devices — model and OS version. | Confirm Zebra DataWedge availability, screen size baseline, Android API level. |
| B9 | Number of concurrent warehouse users, peak transactions/hour. | Sizing for the sync service and row-locking strategy. |
| B10 | Printer model and network setup for labels. | Assume Zebra ZPL over TCP:9100 unless told otherwise. |

**If the human says "just assume", use these defaults and record them in `docs/ASSUMPTIONS.md`:**
WHS = enabled · cloud · posting restricted to `WarehouseSupervisor` · GS1 = yes · QMS = licensed · catch weight = no · recall = out of scope v1 · Zebra TC22 / Android 13 · 40 users · ZPL over TCP.

---

## 2. WHAT WE ARE BUILDING

A ruggedized Arabic (RTL) handheld application used by warehouse and production floor staff to execute inventory transactions against Dynamics 365 Finance & Operations.

**32 screens across 8 modules:**

| Module | Screens | Scope |
|---|---|---|
| Core | 01–02 | Login, shift context, home |
| A · Purchase receiving | 03–10 | PO scan, lines, item scan, qty/dimensions, location, review, post, system states |
| B · Outbound | 11–14 | Load list, guided picking, packing, ship confirm |
| C · Counting | 15–17 | Count tasks, blind count, variance approval |
| D · Movement | 18–19 | Location/LP transfer, inventory adjustment |
| E · Transfer orders | 20–21 | Transfer ship, transfer receive |
| F · Production | 22–26 | Prod orders, component issue, surplus return, report as finished, FG label |
| G · Quality & returns | 27–32 | QC queue, tests, decision, quarantine release, RMA receipt, RMA disposition |

**Success criteria for v1:** a receiving clerk can complete a full PO receipt in under 90 seconds without touching a keyboard, offline, and the result is identical in D365 to what a user would have entered on the desktop client.

---

## 3. FOUR RULES THAT GOVERN EVERY SCREEN

These are the design thesis. When a spec below is ambiguous, resolve it with these.

1. **Inventory status is the control plane.** `Available` / `QI` / `Blocked` decides what can be picked, issued, sold, or moved. Never enforce this with a location alone. Every query for "what can I use" filters on status first.
2. **Every quantity change carries a reason.** No adjustment, variance, shortage, or return posts without a reason code. Reason is a required field, never optional, never free text only.
3. **Batches are suggested, not typed.** FEFO proposes; deviation is allowed but requires a justification that is persisted on the transaction.
4. **Registration is separated from posting.** The floor worker records physical reality. A supervisor posts the financial effect. These are different permissions and often different screens.

---

## 4. TECH STACK

Use exactly this unless the human overrides.

```
App          React Native 0.76+ (bare, not Expo — needs native scanner intents)
Language     TypeScript, strict mode, no `any`
State        Zustand (UI state) + TanStack Query (server state)
Local DB     SQLite via op-sqlite (WatermelonDB if the human prefers an ORM)
Scanner      Zebra DataWedge intent API; camera fallback via vision-camera + ML Kit
Navigation   React Navigation (native stack)
i18n         i18next, ar-EG default, RTL forced via I18nManager
Forms        react-hook-form + zod schemas (zod schemas are the single source of validation truth)
HTTP         ky, with a custom auth + retry + idempotency middleware
Auth         Entra ID (MSAL) — authorization code + PKCE, refresh token in Keychain/Keystore
Printing     ZPL strings over raw TCP socket (react-native-tcp-socket)
Testing      Vitest (unit) + Maestro (device E2E)
Backend BFF  Node 22 + Fastify + TypeScript  ← see §6, this is NOT optional
```

**Why a BFF and not direct-to-D365:** posting requires transactional X++ logic, idempotency keys, retry semantics, and response shaping that OData cannot express. The mobile app must never hold D365 service-principal credentials, and offline replay must be deduplicated server-side. Build the BFF first.

---

## 5. ARCHITECTURE — offline-first

The warehouse has poor coverage. **Offline is the normal case, not the exception.**

```
┌─────────────────────────────────────────────────────┐
│  React Native app                                    │
│                                                      │
│  Screens ──▶ Zustand ──▶ Repository layer            │
│                              │                       │
│                     ┌────────┴────────┐              │
│                     ▼                 ▼              │
│               SQLite (cache)    Outbox (queue)       │
│                     │                 │              │
└─────────────────────┼─────────────────┼──────────────┘
                      │                 │
                      ▼                 ▼
              ┌───────────────────────────────┐
              │  BFF (Fastify)                │
              │  · idempotency store (Redis)  │
              │  · request shaping            │
              │  · retry / circuit breaker    │
              └───────────┬───────────────────┘
                          ▼
              ┌───────────────────────────────┐
              │  D365 F&O                     │
              │  · OData (reads)              │
              │  · Custom X++ services (writes)│
              └───────────────────────────────┘
```

### 5.1 The Outbox — implement this before any screen

Every write is an envelope appended to a local `outbox` table, never a direct network call.

```ts
type OutboxEntry = {
  id: string;                 // uuidv7 — this IS the idempotency key
  operation: OperationType;   // 'PURCH_REGISTER' | 'COUNT_POST' | ...
  payload: unknown;           // zod-validated at enqueue time
  createdAt: string;
  attempts: number;
  status: 'pending' | 'inflight' | 'synced' | 'failed';
  lastError?: { code: string; messageAr: string; retryable: boolean };
  deviceId: string;
  userId: string;
};
```

Rules:
- Enqueue is synchronous and always succeeds. The UI confirms immediately.
- A background worker drains **in insertion order** with exponential backoff (1s, 4s, 15s, 60s, then every 5 min).
- The BFF stores `id` in Redis for 7 days. A repeat `id` returns the original response, never re-posts. **A duplicate goods receipt is the most expensive bug in this system.**
- Non-retryable failures (validation, permission) surface as a badge on the home screen and a resolution screen. They are never silently dropped.
- LP numbers generated offline use `LP-{deviceShortId}{seq}` to guarantee uniqueness without a server round trip.

### 5.2 Cache and sync

| Data | Strategy | TTL |
|---|---|---|
| Items, barcodes, UoM conversions | Full sync on shift start, delta hourly | 24h |
| Locations, warehouses | Full sync on shift start | 24h |
| Open POs / loads / prod orders / count work | Delta every 5 min while online | 15 min stale-ok |
| Reason codes, test groups | Full sync daily | 24h |
| On-hand quantities | **Never cached as truth.** Show with a "last updated" timestamp. | — |

### 5.3 Concurrency

Soft-lock lines being worked on. `POST /locks` with a 5-minute TTL and a heartbeat. On collision show the Arabic message from screen 10, including the other user's name. Never show a raw HTTP 409.

---

## 6. BFF — build this first

```
bff/
├── src/
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── receiving.ts       # screens 03–09
│   │   ├── outbound.ts        # 11–14
│   │   ├── counting.ts        # 15–17
│   │   ├── movement.ts        # 18–19
│   │   ├── transfer.ts        # 20–21
│   │   ├── production.ts      # 22–26
│   │   ├── quality.ts         # 27–30
│   │   ├── returns.ts         # 31–32
│   │   ├── master-data.ts     # sync endpoints
│   │   └── labels.ts
│   ├── d365/
│   │   ├── odata-client.ts
│   │   ├── service-client.ts  # custom X++ endpoints
│   │   └── entities/
│   ├── middleware/
│   │   ├── idempotency.ts     # ← critical
│   │   ├── auth.ts
│   │   └── error-mapper.ts    # D365 errors → Arabic messages
│   └── schemas/               # zod, SHARED with the app via a workspace package
└── test/
```

### 6.1 Error mapping — required

D365 returns unusable errors. Every error the app can receive must map to `{ code, messageAr, actionAr, retryable }`.

```ts
// Never let a raw D365 message reach the UI.
'Inventory transactions are missing' →
  { code: 'INSUFFICIENT_ONHAND',
    messageAr: 'الكمية المتاحة غير كافية في الموقع ده.',
    actionAr: 'اعمل جرد سريع للموقع أو اختار موقع تاني.',
    retryable: false }
```

Build this as a lookup table in `error-mapper.ts` and grow it during integration testing. **Rule: every error message states what happened AND what to do. "حدث خطأ ما" is a bug.**

### 6.2 X++ custom services to be written (D365 side)

The human's D365 developer writes these; you define the contract and mock them first.

| Service | Operation | Wraps |
|---|---|---|
| `WhsMobPurchService` | `registerReceipt` | Arrival journal / `WHSRFControlData` |
| | `postProductReceipt` | `PurchFormLetter::main` |
| `WhsMobOutboundService` | `confirmPick` / `packContainer` / `shipConfirm` | Work execution / `SalesFormLetter` |
| `WhsMobCountService` | `postCount` | `InventJournalTable` (counting) |
| `WhsMobMovementService` | `moveInventory` / `adjustInventory` | Transfer / Movement journals |
| `WhsMobTransferService` | `shipTransfer` / `receiveTransfer` | `InventTransferParmTable` |
| `WhsMobProdService` | `issueComponent` / `returnComponent` / `reportAsFinished` | Picking list / RAF journals |
| `WhsMobQualityService` | `submitResults` / `submitDecision` / `releaseFromQI` | `InventQualityOrderTable`, `InventTestResult` |
| `WhsMobReturnService` | `receiveReturn` / `postDisposition` | `ReturnTable`, disposition codes |

Every service takes `idempotencyKey`, `deviceId`, `userId` and returns `{ success, referenceId, warnings[], errors[] }`.

**Mock all of these behind a `USE_D365_MOCKS=true` flag so the app can be built and demoed before D365 access exists.** This is a hard requirement — do not block UI work on ERP access.

---

## 7. DESIGN SYSTEM

Taken from the approved mockups. Do not invent new values.

```ts
export const tokens = {
  color: {
    steel:    '#131C24',  // chrome / app bar
    steel2:   '#1B2833',
    paper:    '#F7F6F3',  // screen background
    paper2:   '#ECEAE4',  // inset surfaces
    ink:      '#111A21',  // primary text
    muted:    '#69787F',  // secondary text
    orange:   '#FF6B1A',  // primary action, scan affordance
    orangeD:  '#E15709',  // pressed
    green:    '#0E8A63',  // pass / complete / release
    red:      '#CE2F22',  // fail / reject / negative variance
    amber:    '#B97400',  // warning / conditional / pending
    blue:     '#1F6FEB',  // informational / in-transit
  },
  radius: { field: 10, screen: 8, pill: 999 },
  space:  { xs: 4, sm: 7, md: 12, lg: 14, xl: 18 },
  font: {
    ui:   'IBMPlexSansArabic',  // 300/400/500/600/700
    data: 'IBMPlexMono',        // ALL numbers, codes, IDs, locations, batches
  },
} as const;
```

**Typography rules**
- Arabic UI text → `IBMPlexSansArabic`.
- Every number, item code, PO number, location, batch, LP → `IBMPlexMono`, `direction: ltr`, isolated so it doesn't scramble in RTL. This is not cosmetic — mono digits are how a worker verifies a code at a glance.
- Primary quantity display: 44–46px, weight 600. It must be readable at arm's length.
- Location callout ("go to"): 34px mono on dark, centered.

**Ergonomics — non-negotiable**
- Minimum touch target **48×48dp**. Users wear gloves.
- Primary action is a full-width button at the bottom of the screen, always in the same position across screens.
- Never place a destructive action adjacent to a confirm action.
- Screen brightness and contrast tuned for dim warehouse lighting: no grey-on-grey, minimum 4.5:1 contrast on all text.
- Haptic + distinct audio tone on: scan success (short high), scan reject (double low), post success (rising), post failure (falling). Workers rely on audio, not the screen.

**Shared components to build in `src/components/`**

`AppBar` · `ScanField` · `ScanReticle` · `GoToLocation` · `QuantityBox` · `NumPad` · `LineCard` · `TaskCard` · `Chip` · `Alert` (warn/err/ok/info) · `DataTable` · `TestRow` · `Decision3` · `PhotoSlot` · `StepIndicator` · `ReceiptCard` · `PrimaryButton` · `SyncBadge`

Build these **before** any screen. Every screen is an assembly of these — if a screen needs a new primitive, add it to this list rather than styling inline.

---

## 8. DOMAIN MODEL

```ts
type InventoryStatus = 'Available' | 'QI' | 'Blocked';

type ShiftContext = {
  userId: string; userName: string;
  siteId: string; warehouseId: string;
  startedAt: string;
};

type TrackingDimensions = {
  batchId?: string;
  serialId?: string;
  expiryDate?: string;   // ISO
  manufacturedDate?: string;
};

type StorageDimensions = {
  siteId: string; warehouseId: string;
  locationId?: string; licensePlateId?: string;
  inventoryStatus: InventoryStatus;
};

type ItemMaster = {
  itemId: string; nameAr: string;
  baseUnit: string;
  unitConversions: { fromUnit: string; toUnit: string; factor: number }[];
  tracksBatch: boolean; tracksSerial: boolean; tracksExpiry: boolean;
  shelfLifeDays?: number;
  minShelfLifeOnReceiptDays?: number;   // reject below this
  requiresQualityCheck: boolean;
  barcodes: { barcode: string; unit: string; type: 'EAN13'|'GS1128'|'CODE128'|'QR' }[];
};

type ReasonCode = {
  code: string; nameAr: string;
  appliesTo: ('adjustment'|'count'|'shortage'|'return'|'transfer_loss'|'batch_deviation')[];
  requiresPhoto: boolean;
  requiresApproval: boolean;
  glAccount?: string;
};

type GS1Parsed = {
  gtin?: string;      // AI 01
  batchId?: string;   // AI 10
  serialId?: string;  // AI 21
  expiryDate?: string;// AI 17  → YYMMDD
  quantity?: number;  // AI 30
  raw: string;
};
```

**GS1 parser** — `src/lib/gs1.ts`. Handle FNC1 group separator (`\x1D`), fixed-length AIs (01=14, 17=6, 11=6, 15=6), variable-length AIs terminated by FNC1 or end of string. Unit-test against at least 20 real supplier barcodes before trusting it. Screen 05 depends entirely on this.

---

## 9. TOLERANCE, FEFO, AND STATUS LOGIC

Three pieces of shared logic used across many screens. Implement once in `src/domain/`, unit-test heavily.

### 9.1 Tolerance (`src/domain/tolerance.ts`)
```
checkTolerance(orderedQty, alreadyReceived, newQty, overPct, underPct)
  → { verdict: 'ok' | 'warn_over' | 'block_over' | 'warn_under', deltaPct, requiresApproval }
```
Evaluated **live as the user types**, not on submit. Over-tolerance within limits → amber warning inline. Beyond limits → block the confirm button and offer "request supervisor approval".

### 9.2 FEFO (`src/domain/fefo.ts`)
```
suggestBatch(onHandBatches, requiredQty, minShelfLifeDays)
  → { suggested: Batch, alternatives: Batch[], blocked: Batch[] }
```
- Sort by expiry ascending, then by receipt date.
- Exclude any batch with `inventoryStatus !== 'Available'`. **Quarantined stock must not appear as an option at all** — not greyed out, absent.
- Exclude expired batches and those below `minShelfLifeOnReceiptDays`.
- If the user scans a non-suggested batch: allow, but require a `batch_deviation` reason code, and persist it on the transaction line.

### 9.3 Status transitions (`src/domain/status.ts`)
```
Receipt (item.requiresQualityCheck)      → QI    else → Available
Report as finished (requiresQualityCheck)→ QI    else → Available
Return order receipt                     → QI    ALWAYS, no exception
Quality decision: accept                 → Available
Quality decision: conditional            → Available (with correction record)
Quality decision: reject                 → Blocked
```
Enforce as a state machine. Any transition not in the table throws. Movement (screen 18) may not change status — that is only screens 29/30.

---

## 10. SCREEN SPECIFICATIONS

Format for each screen: **route · purpose · key elements · validation · API · done when**.
Arabic strings shown in quotes are final copy — use verbatim.

### CORE

#### 01 · Shift start — `/shift/start`
Set site + warehouse once per shift. Everything downstream inherits it.
- Fields: user (read-only from token), Site picker, Warehouse picker, "ابدأ الوردية", secondary "مسح كارت الموظف بدل الإدخال".
- Warehouse list filtered by the user's D365 warehouse permissions.
- On start: trigger full master-data sync with a progress indicator; block entry until items/locations/reason codes are cached.
- **Done when:** app restarts restore the shift context without re-login; changing warehouse mid-shift requires an explicit return to this screen.

#### 02 · Home — `/home`
- One primary task card (استلام مشتريات) + secondary grid: مرتجع مورد · جرد وعدّ · استعلام صنف · إعادة طباعة ليبل. Add module entry points as they are built.
- Persistent `SyncBadge` when outbox depth > 0: "3 عمليات في انتظار المزامنة — هتترفع تلقائيًا أول ما الشبكة ترجع."
- Shift productivity counter (transactions since shift start).
- **Done when:** badge count is live, tapping it opens the outbox resolution screen.

### MODULE A — PURCHASE RECEIVING

#### 03 · Scan PO — `/receiving/scan`
- Scanner armed on mount, soft keyboard suppressed. Reticle + "وجّه الماسح على باركود أمر الشراء أو بوليصة الشحن".
- Accept PO number, ASN/shipment, or LP — detect by pattern, resolve to a PO.
- "وصلوا النهاردة" list: last/expected POs with vendor name, remaining lines, expected date.
- Closed/cancelled PO → explicit Arabic message naming the state.
- API: `GET /receiving/orders?warehouse=&q=`
- **Done when:** a hardware scan navigates to screen 04 with zero taps.

#### 04 · PO lines — `/receiving/:poId/lines`
- Header: vendor, expected date, currency, terms, overall progress bar.
- Filter chips: "غير مكتمل" (default) · "الكل" · "مستلم".
- Line card shows three numbers in mono: متبقي / مستلم / مطلوب, plus a colour-coded bar (red=untouched, amber=partial, green=complete).
- Completed lines sort to the bottom automatically.
- Soft lock indicator when another user holds the line.
- **Done when:** default filter hides completed lines; a line completed elsewhere updates within one poll cycle.

#### 05 · Scan item — `/receiving/:poId/scan-item`
- Resolve barcode → item via cached `barcodes` table, then to the matching PO line.
- On GS1-128: parse and display the AI breakdown as chips (GTIN ✓ / دفعة / صلاحية) and pre-fill dimensions. Show "الباركود GS1-128 اتقرأ بالكامل — الدفعة وتاريخ الصلاحية اتملّوا تلقائيًا."
- Item not on PO → reject with a distinct audio tone and "الصنف مش ضمن أمر الشراء ده." + "امسح صنف من السطور، أو اطلب من المشتريات يضيفه للأمر." Adding a line is permitted only for authorised roles.
- **Done when:** GS1 parser passes its unit-test suite; unknown barcode gives a specific, actionable message.

#### 06 · Quantity & dimensions — `/receiving/:poId/line/:lineId/qty`
The most important screen in the app. Get this one right.
- Large mono quantity (44px+), unit label with explicit conversion: "قطعة · (10 كراتين + 6) — الكرتونة = 12 قطعة".
- Quick actions: `+1` · `+ كرتونة` · `كل المتبقي`. Numpad below.
- Batch / serial / expiry inputs render **only if** the item tracks that dimension.
- Live tolerance check (§9.1) → amber bar: "زيادة 5% عن المطلوب — الحد المسموح 5%. محتاج موافقة مشرف."
- Expiry below `minShelfLifeOnReceiptDays` → **block**, not warn.
- **Done when:** conversion math is correct for every UoM in the cache; tolerance fires while typing; blocked expiry cannot be bypassed.

#### 07 · Location & LP — `/receiving/:poId/putaway`
- Suggested location card (green border, "مقترح") from Location Directive (WHS) or warehouse default.
- Scan field for an alternative location; reject locations outside the current warehouse.
- LP field, auto-generated when new, marked "جديدة".
- "إضافة صنف تاني لنفس اللوحة" returns to 05 keeping the LP.
- **Done when:** suggestion appears in <500ms from cache; offline-generated LPs never collide.

#### 08 · Review & post — `/receiving/:poId/review`
- Summary table of all registered lines with quantity and location, plus a total row.
- **Required** fields: "إذن التوريد للمورد" → `PackingSlipId`, "تاريخه" → `DeliveryDate`. Confirm disabled until both are filled.
- Operation type chips: "تسجيل فقط" (default) · "تسجيل وترحيل". The second is visible only to users with the posting role (B3); for others render it disabled with the reason.
- Over-tolerance lines listed with "هيتبعت لمشرف الوردية للموافقة."
- API: `POST /receiving/register` or `/receiving/post` with `idempotencyKey`.
- **Done when:** a non-supervisor physically cannot post; enqueue succeeds offline and the UI confirms immediately.

#### 09 · Result — `/receiving/result/:refId`
- Green stamp, line/unit counts, reference card with barcode, registration number, PO, and status ("في انتظار ترحيل المشرف" when register-only).
- Actions: "طباعة ليبل اللوحة" (ZPL) · "استلام أمر جديد".
- When queued offline, show the local reference and a pending chip — never a fake success.
- **Done when:** label prints; reprints are logged.

#### 10 · System states — not a route, a component set
Implement these as reusable states available anywhere:
- Item not on order · expiry below minimum · line locked by another user · offline mode · sync in progress · sync succeeded · non-retryable failure.
- Offline banner copy: "مفيش شبكة. كمّل شغلك عادي — كل عملية بتتحفظ وهتترفع أول ما الشبكة ترجع."
- **Done when:** no screen in the app can display a raw HTTP status or an English D365 message.

### MODULE B — OUTBOUND

#### 11 · Load list — `/outbound/loads`
- Chips: "جاهز للتجميع" · "قيد التجميع" · "جاهز للشحن".
- Cards sorted by **departure time**, not creation. Past-due loads render red with a countdown chip.
- **Done when:** sort order is departure time and late loads are visually unmistakable.

#### 12 · Guided picking — `/outbound/:loadId/pick`
- `StepIndicator` "3 / 12" with progress dots.
- `GoToLocation` block: 34px mono location + human-readable aisle description.
- Item card + FEFO-suggested batch. Required quantity in a `QuantityBox`.
- **Location scan is mandatory before quantity entry.** This is the single control that prevents picking from the wrong rack.
- "الكمية ناقصة / الموقع فاضي" → short-pick flow: record shortage with reason, request replenishment work from an alternative location.
- **Done when:** quantity input is disabled until the location scan matches; short pick generates follow-up work.

#### 13 · Packing — `/outbound/:loadId/pack`
- Container header (type, "الطرد 4 من 6", running weight), contents table, scan-to-add field.
- Auto-close prompt at max container weight.
- "إغلاق الطرد وطباعة الليبل" → ZPL label with customer, container id, "3 من 6", barcode.
- Closed containers are immutable without a formal reopen action.
- **Done when:** weight accumulates from item master; label prints with the correct n-of-m.

#### 14 · Ship confirm — `/outbound/:loadId/ship`
- Container checklist with scan-to-load; progress "4 / 6 محمّل".
- Driver name + vehicle plate fields.
- **Post button stays disabled until every container is scanned.** Copy: "لسه طردين ما اتمسحوش. الشحن مقفول لحد ما يكتملوا."
- Posts packing slip and closes the load.
- **Done when:** partial shipment is impossible by accident; driver/vehicle persist for traceability.

### MODULE C — COUNTING

#### 15 · Count tasks — `/counting`
- Chips: "دوري" · "موقع محدد" · "صنف محدد". Task cards with location count and progress; overdue in red.
- "جرد سريع لموقع (امسح الموقع)" creates an ad-hoc count.
- Counting soft-locks the location against picking.
- **Done when:** locking works and cycle-count work is pulled from D365.

#### 16 · Blind count — `/counting/:workId/count`
- **On-hand quantity must not be fetched to the device.** Not hidden in state, not present in the response. Chip: "👁 الكمية النظرية مخفية".
- Location callout, item + batch, numpad, "تأكيد العدّ", explicit "الموقع فاضي" button.
- On large variance → immediate recount prompt before the value is accepted.
- **Done when:** a network inspection of the response contains no expected quantity.

#### 17 · Variance & approval — `/counting/:workId/variance`
- Table: system · counted · delta, rows tinted by sign, total row showing **cost impact in EGP**.
- Reason chips required per varying line.
- Threshold breach → "سطر FG-2115 فرقه 20% — أعلى من حد الـ 5%. محتاج اعتماد مدير المخزن." and route to approval instead of posting.
- Actions: "رفع للاعتماد" · "إعادة عدّ السطور المختلفة".
- **Done when:** cost impact is calculated from current cost; below-threshold variances post directly, above-threshold cannot.

### MODULE D — MOVEMENT

#### 18 · Move inventory — `/movement/move`
- Mode chips: "نقل لوحة كاملة" (default) · "نقل صنف بكمية".
- LP scan → show contents → destination location scan → execute.
- Validate destination capacity and type. **Reject any move into or out of a QI location** — that is screens 29/30 only.
- Movement never changes quantity, value, or status.
- **Done when:** whole-LP move posts as one transaction; QI locations are unreachable from here.

#### 19 · Adjust inventory — `/movement/adjust`
- Direction chips: "إضافة (+)" · "خصم (−)".
- Item + location + batch context, quantity, **required** reason code.
- Photo **required** when `reasonCode.requiresPhoto` (damage). Attachment uploads with the outbox entry.
- Show financial impact before posting: "الخصم هيقلل قيمة المخزون بـ 312 EGP ويترحّل على حساب المصروف المرتبط بالسبب."
- Restricted role. Destructive-styled confirm button.
- **Done when:** posting without a reason or required photo is impossible; impact figure matches D365 cost.

### MODULE E — TRANSFER ORDERS

#### 20 · Transfer ship — `/transfer/:trnId/ship`
- From/to warehouse header, line list with remaining/loaded/required, LP or item scan, driver + vehicle.
- Partial shipment allowed; order stays open for the remainder.
- Posts transfer shipment → stock moves to **in-transit**.
- Print transfer note from the device.
- **Done when:** in-transit quantity is visible and partial ship leaves the order open.

#### 21 · Transfer receive — `/transfer/:trnId/receive`
- Header shows shipped time and driver, status chip "في الطريق".
- Table: shipped vs received per line, discrepancies tinted.
- **Any discrepancy requires a reason before the order can close**: "تالف في الطريق" · "نقص عند الصرف" · "فقد". Loss posts against the responsible warehouse per reason.
- Photos attachable for carrier claims.
- **Done when:** closing with an unexplained discrepancy is impossible; aged in-transit orders raise an alert.

### MODULE F — PRODUCTION

#### 22 · Production orders — `/production`
- Filtered to the user's production line (`Resource group`). Chips: "جاري" · "مجدول".
- Order card: product, target quantity, start time, remaining components count, progress.
- Inline picking-list preview (issued / required per component).
- **Done when:** list is scoped to the user's line and remaining quantities are live.

#### 23 · Issue component — `/production/:prodId/issue/:bomLineId`
- Component header with required / issued / progress.
- FEFO-suggested batch card (green border, "مقترح FEFO") with expiry, available qty, location.
- Quantity box showing the remainder after issue.
- Scanning a different batch → allowed, but forces a `batch_deviation` reason persisted on the production order.
- Quarantined material is **absent** from options. Expired or near-expiry batches are **blocked**, not warned.
- **Done when:** traceability links component batch → production order in D365; deviations are queryable.

#### 24 · Return surplus — `/production/:prodId/return`
- Shows what was issued to the order; return must use the **same batch**.
- Quantity + condition ("صالح للاستخدام" / not) + destination location scan.
- Posts as a negative picking-list line — **not** an inventory adjustment. This is what keeps production cost accurate.
- Non-usable material routes to QI, not to available stock.
- **Done when:** returns reduce issued quantity on the order and the cost recalculates.

#### 25 · Report as finished — `/production/:prodId/raf`
- Good quantity and scrap quantity **on the same screen, side by side**. Splitting them causes scrap to be reported as zero forever.
- New batch id from number sequence; manufacturing date = today; expiry = today + `shelfLifeDays`, all displayed read-only.
- If `requiresQualityCheck`: amber notice "الصنف ده محتاج فحص جودة — هيتوجّه لمنطقة الحجر QI-01 مش للمخزن المتاح." and status is set to QI on post.
- **Done when:** scrap is capturable in the same transaction and QI routing is automatic.

#### 26 · FG label — `/production/:prodId/label`
- Receipt card with batch barcode, product, batch, mfg/expiry, LP, and status.
- Status "محجوز — تحت الفحص" must be **visually loud** on the printed label (inverse block or diagonal band), not a small line of text.
- Copies × LP count selector; reprints logged.
- **Done when:** ZPL renders a scannable batch barcode and quarantine state is unmissable at 2 metres.

### MODULE G — QUALITY & RETURNS

#### 27 · QC queue — `/quality`
- One queue, three sources. Chips: "الكل" · "مشتريات" · "إنتاج" · "مرتجعات".
- Card: item, source document (PO / prod order / RMA), sample size vs lot size, age chip (red when past target inspection time).
- Header warning: "4 أوامر تخطت زمن الفحص المستهدف. البضاعة محجوزة والفواتير موقوفة."
- "امسح ليبل لفتح أمر الفحص" — scanning an LP opens its quality order.
- **Done when:** all three sources appear in one list and ageing is computed from creation time.

#### 28 · Execute tests — `/quality/:qoId/tests`
- `StepIndicator` "4 / 5".
- `TestRow` per test: name, specification (mono, LTR), measured value input, verdict badge.
- **The verdict is computed from the spec, never entered by the inspector.** Pass = green, fail = red row tint, pending = grey.
- Long-running tests stay open; the lot remains quarantined.
- Photo and certificate attachment.
- **Done when:** a failed measurement cannot be recorded as a pass by any UI path.

#### 29 · Quality decision — `/quality/:qoId/decision`
- Result summary chip ("4 نجح · 1 رسب"), quantity, vendor/source.
- `Decision3`: **قبول** (→ Available) · **قبول مشروط** (→ Available + correction record + invoice deduction) · **رفض** (→ Blocked + nonconformance + return/scrap path).
- Conditional acceptance captures the condition ("خصم 8% من قيمة الفاتورة") and a disposition scope chip ("إفراج للمخزون المتاح" / "تقييد على أمر إنتاج واحد").
- Approver identity + signature captured. **Rejection requires a role above the inspector.**
- Warning: "هيتفتح تقرير عدم مطابقة على المورد ويتسجّل في تقييمه."
- Feeds vendor scorecard / rejection rate.
- **Done when:** each of the three outcomes produces the correct D365 records and the correct inventory status transition (§9.3).

#### 30 · Quarantine & release — `/quality/quarantine`
- Header: quantity of LPs, item count, and **total value held in EGP** — this is the number that drives management to speed up inspection.
- LP rows with status chips: "تم الاعتماد" (releasable) · "تحت الفحص" · "مرفوض — للإرجاع".
- Actions: "إفراج LP-xxxx" (QI → Available) · "تجهيز المرفوض للإرجاع للمورد".
- **Done when:** release is the only path out of QI, and released stock immediately becomes pickable everywhere.

#### 31 · Return receipt — `/returns/:rmaId/receive`
- RMA header linked to the original invoice, authorised quantity shown.
- Item + original batch, actual received quantity, return reason (from `Return reason codes`), apparent condition chips.
- Photo attachment expected.
- Under-receipt warning: "ناقص 8 وحدات عن المصرّح — الإشعار الدائن هيتحسب على 40 بس."
- **Received goods always enter QI. No exception, no override.**
- **Done when:** status is QI regardless of condition, and a quality order is auto-created.

#### 32 · Return disposition — `/returns/:rmaId/disposition`
- Post-inspection breakdown (e.g. 12 sound / 28 damaged).
- `Decision3` with quantities per outcome: **إعادة للمخزون** · **إعادة تشغيل** · **إتلاف**.
- Impact table: credit note value, restocking fee, scrap loss, net effect — shown **before** posting.
- Auto-flag: repeated returns on the same batch open a quality investigation. Copy: "دفعة B-2604 عليها 3 مرتجعات هذا الشهر — هيتفتح تحقيق جودة على الدفعة."
- **Done when:** disposition codes map correctly and the credit note is tied to the decision, not issued automatically on receipt.

---

## 11. BUILD ORDER

Do not build screens in numeric order. Build the spine first, then modules by value.

**Phase 0 — Foundations** *(nothing user-visible; do not skip)*
1. Monorepo (`app/`, `bff/`, `packages/schemas`), TypeScript strict, lint, CI.
2. BFF skeleton + `USE_D365_MOCKS` + idempotency middleware + error mapper.
3. Design tokens, fonts, RTL setup, and **all shared components with a component gallery screen**.
4. SQLite schema, repository layer, outbox + sync worker + retry policy.
5. DataWedge integration + camera fallback + `useScanner()` hook.
6. Domain logic: GS1 parser, tolerance, FEFO, status machine — with unit tests.
> **Checkpoint:** demo the component gallery and a scan that enqueues a fake transaction offline and syncs on reconnect. Get sign-off before Phase 1.

**Phase 1 — Receiving (01–10).** Highest value, proves the whole pattern end-to-end.
> **Checkpoint:** a real PO received on a real device against a D365 sandbox.

**Phase 2 — Movement & counting (15–19).** Small, self-contained, immediately useful.

**Phase 3 — Outbound (11–14).** Needs picking work and container logic.

**Phase 4 — Production (22–26).**

**Phase 5 — Quality & returns (27–32).** Depends on the status machine being solid.

**Phase 6 — Hardening.** Performance, battery, 8-hour shift soak test, printer reliability, training material.

After each phase: run the full test suite, update `docs/ASSUMPTIONS.md`, and demo on a physical device — never in a simulator.

---

## 12. TESTING

**Unit (required, blocking)**
- GS1 parser: 20+ real barcodes including edge cases (FNC1, variable-length AI at end, missing AIs).
- Unit conversion: every pair in the cache, including 3-hop conversions.
- Tolerance: boundary values at exactly the limit, zero ordered, over-received twice.
- FEFO: equal expiry dates, all batches quarantined, insufficient quantity across batches.
- Status machine: assert every illegal transition throws.

**Integration**
- Outbox: enqueue → kill app → relaunch → verify drain.
- Idempotency: send the same key 5× concurrently → exactly one D365 posting.
- Error mapper: every mapped D365 error returns Arabic text with an action.

**E2E on device (Maestro)**
- Full receiving flow in airplane mode, then reconnect and verify posting.
- Guided pick with a wrong-location scan → must block.
- Blind count → verify no expected quantity in the network trace.
- Quality reject → verify stock becomes unpickable in the outbound flow.

**Manual, before release**
- Gloved operation of every primary action.
- Readability at 1 metre in low light.
- 8-hour battery soak with continuous scanning.
- Arabic RTL: no clipped text, no mirrored numbers, no reversed codes.

---

## 13. DEFINITION OF DONE (per screen)

A screen is not done until all of these are true:
- [ ] Arabic strings match this spec verbatim; nothing hardcoded outside i18n files.
- [ ] Works fully offline; writes go through the outbox.
- [ ] Every error path shows what happened **and** what to do, in Arabic.
- [ ] All touch targets ≥ 48dp; primary action in the standard bottom position.
- [ ] Scan-driven happy path requires zero keyboard input.
- [ ] Audio + haptic feedback on success and failure.
- [ ] Loading, empty, error, and offline states are all implemented.
- [ ] Unit tests for its domain logic; a Maestro flow for its happy path.
- [ ] Verified on a physical device, in Arabic, with gloves on.

---

## 14. THINGS THAT WILL GO WRONG — mitigate up front

| Risk | Mitigation |
|---|---|
| Duplicate postings after a network drop | Idempotency keys, server-side dedupe for 7 days. Non-negotiable. |
| Workers bypassing blind count | Never send the expected quantity to the device. |
| Quarantined stock being picked | Enforce at the query layer, not the UI. Filter on inventory status in every availability call. |
| Scrap never reported | Same screen as good quantity (25). |
| Batch traceability broken by manual entry | FEFO suggestion + deviation reason, never a free-typed batch. |
| Adjustments used to hide problems | Required reason + photo + visible financial impact + restricted role. |
| Unreadable D365 errors reaching users | Central error mapper; treat any English string in the UI as a bug. |
| Cost inflation on production orders | Surplus return screen (24) built as a negative issue, not an adjustment. |
| Label reprints creating duplicate LPs | Reprint is a logged action; it never generates a new LP. |
| RTL layout breaking on numbers | Mono font + LTR isolation on every numeric/code field, enforced in the shared components. |

---

## 15. REFERENCE

Visual mockups for all 32 screens (approved):
- `receiving-app-screens.html` — screens 01–10
- `full-cycle-screens.html` — screens 11–32

Match the layout, hierarchy, colour semantics, and Arabic copy in those files. Where this spec and the mockups disagree, **this spec wins** — but flag the disagreement to the human rather than silently choosing.

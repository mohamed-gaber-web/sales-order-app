# User Story: Project Item Journal (Mobile)

| Field | Value |
|---|---|
| **Story ID** | US-PIJ-001 |
| **Epic** | Project Issuance — Warehouse Mobile |
| **Module** | Project Management & Accounting (D365 F&O) |
| **Company / Data Area** | USMF |
| **Priority** | High |
| **Story Points (suggested)** | 13 |
| **Depends on** | US-PIR-001 (Project Item Requirements) — for shared auth, lookups, and navigation shell |

---

## 1. User Story

> **As a** warehouse operator using the mobile app
> **I want to** open the "Project Item Journal" menu to see all unposted project item journals, create a new journal header on the fly, drill into its lines, and add item issuance lines directly from the floor
> **So that** I can record ad-hoc material consumption against any project without going back to a desktop and without depending on a supervisor to create the journal header for me.

---

## 2. Business Context

Project item journals (`ProjItem`) are the D365 F&O mechanism used to issue inventory directly against a project — typically for **non-sales-order-driven consumption** (e.g., small materials drawn against an internal project, returns to project, corrections). Today this is done from the desktop *Journals → Item* form.

We already cover requirement-based issuance in US-PIR-001 (picking lists posted against `ProjectSalesItemRequirements`). This story complements that flow by giving operators a way to **create and edit raw project item journals** from the mobile app. The two flows are intentionally distinct:

| Flow | Source | Used for |
|---|---|---|
| US-PIR-001 — Project Item Requirements | Sales-order item requirement lines | Issuing against an existing customer commitment |
| **US-PIJ-001 — Project Item Journal** | Free-form journal lines | Ad-hoc consumption, returns, corrections |

---

## 3. Scope

### In scope
- New menu entry **"Project Item Journal"** on the mobile home / Projects section.
- Header list screen showing **only unposted** journals (`Posted = 'No'`).
- Inline "create header" sheet that auto-generates a unique `JournalId` with the `PIJ-` prefix and posts it to D365.
- Lines screen filtered by `JournalId`.
- Inline "create line" form with lookups for **Project**, **Item**, **Line property**, **Category** (Item-only), **Site**, **Warehouse**, and **Currency**.
- Read-only display of all lines on a posted journal (defensive — should not appear here, but in case the filter is removed).

### Out of scope
- **Posting** the journal (moving `Posted` from `No` to `Yes`) — handled by a separate story; the operator currently can only build the journal up to posting-ready.
- Editing or deleting existing lines (this story is **add-only**).
- Voucher / financial-dimension overrides — defaults from D365 are accepted.
- Catch-weight, serial-number capture, or pallet tracking.

---

## 4. Navigation Flow

```
Home  →  Projects section  →  [Project Item Journal]   ← NEW
              │
              ▼
   Screen 1: Unposted Journals List       ← GET /data/ProjectItemJournalTables?$filter=Posted eq 'No'
              │  ┌──── tap "+" (FAB) ─────┐
              │  ▼                        │
              │  Screen 2: New Journal sheet
              │   (auto JournalId, name, description)
              │   tap "Create" → POST /data/ProjectItemJournalTables
              │  └──────────────┬─────────┘
              │                 ▼
              │       (returns full record, navigate into it)
              │
              ▼ (tap a journal row)
   Screen 3: Lines for Journal X           ← GET /data/ProjectItemJournalTrans?$filter=JournalId eq 'X'
              │
              │  tap "+ Add Line"
              ▼
   Screen 4: New Line form
              │  (lookups for Project, Item, Category, Line property, Site, Warehouse, Currency)
              │  tap "Save" → POST /data/ProjectItemJournalTrans
              ▼
   Returns to Screen 3 with the list refreshed
```

---

## 5. Screens & UI Requirements

### Screen 1 — Unposted Journals List

**Title:** "Project Item Journal"
**Eyebrow:** "Unposted journals · USMF"

**Source:**
```http
GET /data/ProjectItemJournalTables?cross-company=true&$filter=dataAreaId eq 'usmf' and Posted eq 'No'
```

**Row fields (the three the user explicitly requested):**

| UI Label | API Field |
|---|---|
| Journal ID (eyebrow, mono font) | `JournalId` |
| Journal Name (title) | `JournalName` |
| Description (body) | `Description` |
| "Unposted" pill (right) | derived from `Posted = 'No'` |
| Detail level (badge) | `PostingDetailLevel` |

**Behaviors:**
- Pull-to-refresh re-runs the GET.
- Search bar filters client-side on `JournalId`, `JournalName`, `Description`.
- **FAB "+"** in the bottom-right opens the *New Journal* sheet (Screen 2).
- Tapping a row navigates to Screen 3 with the row's `JournalId`.
- Empty list → "No unposted journals. Tap + to create one."
- Network error → inline error card with the OData error message and a Retry button.

---

### Screen 2 — New Journal (bottom sheet)

A slide-up sheet (not a full page) so the operator stays in flow.

**Fields:**

| UI Label | Behavior |
|---|---|
| Journal ID | **Auto-generated**, read-only, format `PIJ-{8-char alphanumeric, uppercase}` (e.g. `PIJ-7F2K9QA1`). A small refresh icon lets the user regenerate it. |
| Journal Name | Defaults to `ProjItem`, read-only for this story. |
| Description | Free-text, max 60 chars, defaults to `Project item journal — created via mobile`. |
| Posting Detail Level | Defaults to `Detail`, read-only. |

**CTAs:**
- **Create** → POST request below. On success, close the sheet and navigate into the new journal's Lines screen.
- **Cancel** → dismiss the sheet, no API call.

**Request:**
```http
POST /data/ProjectItemJournalTables
Content-Type: application/json
```
```json
{
  "dataAreaId": "usmf",
  "JournalId": "PIJ-7F2K9QA1",
  "JournalName": "ProjItem",
  "PostingDetailLevel": "Detail",
  "Description": "Project item journal — created via mobile"
}
```

**Response:** the full `ProjectItemJournalTables` entity is returned and used as the source of truth for Screen 3.

**JournalId generation rules:**
1. Prefix `PIJ-` (literal).
2. 8 characters from `[A-Z0-9]`, generated with a cryptographically-strong RNG.
3. Total length: 12 characters.
4. On `409 Conflict` (duplicate `JournalId`), regenerate and retry **once silently**, then surface the error to the user.

---

### Screen 3 — Lines for Journal X

**Title:** the selected `JournalId`
**Eyebrow:** `JournalName · Description` (e.g., `ProjItem · Project item journal`)

**Source:**
```http
GET /data/ProjectItemJournalTrans?cross-company=true&$filter=dataAreaId eq 'usmf' and JournalId eq '{JournalId}'
```

**Header strip (calculated client-side):**

| Stat | Calculation |
|---|---|
| Lines | total count |
| Total qty | `SUM(Quantity)` |
| Total cost | `SUM(CostAmount)` (display in `ProjectSalesCurrencyId` of the first line, or USD fallback) |

**Row fields:**

| UI Element | API Field |
|---|---|
| Line number (eyebrow) | `LineNum` |
| Item name (title) | `ItemId` |
| Project (subtitle) | `ProjectId` |
| Category badge | `ProjectCategoryId` |
| Line property badge | `ProjectLinePropertyId` |
| Quantity + unit | `Quantity` + `ProjectUnitID` |
| Cost | `CostAmount` + `ProjectSalesCurrencyId` |
| Site / Warehouse (footer) | `StorageSiteId` / `StorageWarehouseId` |
| Date | `ProjectDate` |
| Activity (if present) | `ActivityNumber` |

**Behaviors:**
- **"+ Add Line"** sticky button at the bottom opens Screen 4.
- Empty state: "No lines yet. Tap **+ Add Line** to start." with a primary CTA replicating the button.
- Lines are not editable in this story (read-only after creation).
- Pull-to-refresh re-runs the GET.

---

### Screen 4 — New Line Form

A full screen (not a sheet, because it has several lookups).

**Section 1 — Project**

| Field | Lookup / Behavior | Required |
|---|---|---|
| `ProjectId` | Lookup → reuses the projects API from US-PIR-001: `GET /data/Projects?$filter=dataAreaId eq 'usmf'`. Display `ProjectID — ProjectName`. | ✅ |
| `ActivityNumber` | Free-text for now; optional. (Future: lookup against the project's WBS.) | ❌ |

**Section 2 — Item**

| Field | Lookup / Behavior | Required |
|---|---|---|
| `ItemId` | Scannable + searchable. Trim leading/trailing whitespace before send (see Validation §7.5). | ✅ |
| `Quantity` | Integer or decimal, > 0. Default 1. Stepper buttons for ±1. | ✅ |
| `PriceUnit` | Defaults to `1`, read-only for this story. | ✅ |

**Section 3 — Project posting**

| Field | Lookup / Behavior | Required |
|---|---|---|
| `ProjectCategoryId` | Lookup → `GET /data/ProjectCategoryEntities?$filter=dataAreaId eq 'usmf' and TransactionType eq 'Item'`. Display the `Category` field. Default to `ProjItem` if present in the result set. | ✅ |
| `ProjectLinePropertyId` | Lookup → `GET /data/ProjectLineProperties?$filter=dataAreaId eq 'usmf'`. Display the `LinePropertyId` field. Default to `Billable` if present. | ✅ |
| `ProjectSalesCurrencyId` | Defaults to `USD`. Editable as a 3-letter currency code. | ✅ |
| `ProjectDate` | Date picker. Defaults to today (in the user's local TZ). Submitted as `YYYY-MM-DDT12:00:00Z` to mirror the sample payload. | ✅ |

**Section 4 — Storage dimensions**

| Field | Lookup / Behavior | Required |
|---|---|---|
| `StorageSiteId` | Free-text or barcode scan. Default: last-used value (per-device). | ✅ |
| `StorageWarehouseId` | Free-text or barcode scan. Default: last-used value. | ✅ |
| `ProductConfigurationId`, `ProductSizeId`, `ProductColorId`, `ProductStyleId`, `ProductVersionId`, `inventSerialId` | Optional. Hidden behind an "Advanced" expandable group. | ❌ |

**CTAs:**
- **Save** → POST request below. On success, return to Screen 3 with the list refreshed and the new line highlighted briefly.
- **Cancel** → discard, no API call.

**Request:**
```http
POST /data/ProjectItemJournalTrans
Content-Type: application/json
```
```json
{
  "dataAreaId": "usmf",
  "JournalId": "PIJ-7F2K9QA1",
  "StorageSiteId": "Cairo Site",
  "ProductConfigurationId": "",
  "ProductSizeId": "",
  "ProductVersionId": "",
  "PriceUnit": 1,
  "ActivityNumber": "",
  "ProjectLinePropertyId": "Billable",
  "ProjectCategoryId": "ProjItem",
  "ProjectSalesCurrencyId": "USD",
  "inventSerialId": "",
  "ProjectDate": "2026-05-24T12:00:00Z",
  "ItemId": "256 GB Storage",
  "StorageWarehouseId": "1",
  "ProductColorId": "",
  "ProjectId": "000057",
  "ProductStyleId": "",
  "Quantity": 1
}
```

The `JournalId` sent in the body **must equal** the journal opened on Screen 3.

---

## 6. API Contracts (summary)

| # | Purpose | Method & Path |
|---|---|---|
| 6.1 | List unposted headers | `GET /data/ProjectItemJournalTables?cross-company=true&$filter=dataAreaId eq 'usmf' and Posted eq 'No'` |
| 6.2 | Create header | `POST /data/ProjectItemJournalTables` |
| 6.3 | List lines of a journal | `GET /data/ProjectItemJournalTrans?cross-company=true&$filter=dataAreaId eq 'usmf' and JournalId eq '{JournalId}'` |
| 6.4 | Create line | `POST /data/ProjectItemJournalTrans` |
| 6.5 | Lookup — line properties | `GET /data/ProjectLineProperties?cross-company=true&$filter=dataAreaId eq 'usmf'` |
| 6.6 | Lookup — categories (Item) | `GET /data/ProjectCategoryEntities?cross-company=true&$filter=dataAreaId eq 'usmf' and TransactionType eq 'Item'` |
| 6.7 | Lookup — projects | `GET /data/Projects?cross-company=true&$filter=dataAreaId eq 'usmf'` (shared with US-PIR-001) |

**Host:** `https://growpath.sandbox.operations.eu.dynamics.com`
**Auth:** OAuth2 bearer token (existing app auth).

---

## 7. Validation Rules

1. **JournalId uniqueness** — generated on the client; on `409` retry once with a fresh value, then surface the error.
2. **Required line fields** — `ProjectId`, `ItemId`, `Quantity`, `ProjectCategoryId`, `ProjectLinePropertyId`, `ProjectSalesCurrencyId`, `ProjectDate`, `StorageSiteId`, `StorageWarehouseId`.
3. **Quantity** must be `> 0`. Decimal support depends on the item's UoM; for v1 accept decimals up to 4 places and let the server reject if not supported.
4. **ProjectDate** must not be in the future by more than 1 day, and not older than the open fiscal period. Server is the authority; client just warns.
5. **ItemId** — trim leading/trailing whitespace before posting. (The sample payload `" 256 GB Storage"` had a leading space — that's almost certainly a copy-paste artifact, not a real item code, and we should defend against it.)
6. **Lookup integrity** — if a lookup call fails, do not block the form; show a manual text input fallback and warn that values aren't validated.
7. **Cross-screen safety** — the `JournalId` shown in Screen 3 is always echoed back into the body for Screen 4. The user cannot edit it.

---

## 8. Acceptance Criteria

**AC1 — Menu entry exists**
- Given I am on the mobile home screen, when I expand the Projects section, then I see a "Project Item Journal" menu item.

**AC2 — Unposted journals load**
- Given I tap "Project Item Journal", when the screen opens, then the app calls `GET /data/ProjectItemJournalTables?cross-company=true&$filter=dataAreaId eq 'usmf' and Posted eq 'No'` and renders each result as a row showing `JournalId`, `JournalName`, and `Description`.

**AC3 — Posted journals are hidden**
- Given the API returns at least one record with `Posted = 'Yes'`, when the list renders, then that record is **not** displayed.

**AC4 — Create journal — auto ID**
- Given I tap the FAB, when the New Journal sheet opens, then a `JournalId` field is pre-filled with a value matching `^PIJ-[A-Z0-9]{8}$` and is read-only.

**AC5 — Create journal — POST**
- Given the New Journal sheet is filled, when I tap "Create", then the app calls `POST /data/ProjectItemJournalTables` with the body shape from §5 Screen 2, and on success closes the sheet and navigates to the Lines screen for the new `JournalId`.

**AC6 — Create journal — conflict retry**
- Given the server returns `409 Conflict` for a duplicate `JournalId`, when the create call fails, then the app regenerates the `JournalId` once silently and re-posts. If the second attempt also fails, the user sees an error toast.

**AC7 — Lines load**
- Given I tap a journal row, when the Lines screen opens, then the app calls `GET /data/ProjectItemJournalTrans?cross-company=true&$filter=dataAreaId eq 'usmf' and JournalId eq '{id}'` and renders each line with the fields listed in §5 Screen 3.

**AC8 — Empty lines**
- Given a freshly created journal has no lines, when the Lines screen opens, then I see "No lines yet" and a primary "+ Add Line" CTA.

**AC9 — Lookups populate**
- Given I open the New Line form, when the Category and Line Property dropdowns are tapped, then they show values from the corresponding D365 endpoints (§6.5 and §6.6), filtered as specified.
- Given the Category lookup is filtered by `TransactionType eq 'Item'`, when I open it, then only Item-type categories appear (e.g., `ProjItem`, `EAMMI`).

**AC10 — Project lookup**
- Given I tap the Project field, when the picker opens, then I can search and select from the same Projects endpoint used in US-PIR-001, and the chosen `ProjectID` is stored as `ProjectId` on the line.

**AC11 — Create line — POST**
- Given the New Line form is valid, when I tap "Save", then the app calls `POST /data/ProjectItemJournalTrans` with all required fields plus the current `JournalId`, and on success returns to the Lines screen with the list refreshed.

**AC12 — Required field validation**
- Given any required field is empty, when I tap "Save", then the field is highlighted and the POST is **not** sent.

**AC13 — Last-used dimensions**
- Given I have previously saved a line on this device, when I open a new line form on the same device, then `StorageSiteId` and `StorageWarehouseId` default to the values from the last saved line.

**AC14 — Loading & offline**
- All list and form screens show skeleton/spinner states while their HTTP calls are in-flight.
- If the device is offline, the user sees an offline banner; the FAB and "+ Add Line" buttons are disabled.

**AC15 — Error feedback**
- Any 4xx/5xx response on POST shows an inline error with the server message and a Retry button. The form retains the user's input.

---

## 9. Non-functional Requirements

- **Performance**
  - Headers list TTI ≤ 1.5 s with 200 records.
  - Lookups (categories, line properties) cached for the session; refreshed on pull-to-refresh.
- **Auth** — reuses the shared OAuth2 token from US-PIR-001.
- **Telemetry** — log every POST with: timestamp, user, endpoint, `JournalId`, HTTP status, server message (truncated). PII-safe.
- **Localization** — English first; structure strings for future Arabic (RTL-safe).
- **Accessibility** — all interactive controls hit ≥ 44 × 44 pt; contrast ≥ AA on the dark theme.

---

## 10. Definition of Done

- [ ] All 15 acceptance criteria pass on iOS and Android.
- [ ] Endpoints are environment-configurable (sandbox / UAT / prod).
- [ ] Unit tests cover:
  - `generateJournalId()` (format, randomness, no collisions across 10⁶ runs).
  - `buildJournalBody()` and `buildLineBody()` (correct field mapping, defaults, trimming).
- [ ] Integration test in sandbox: create a journal, add 2 lines, verify both appear in the GET response under the new `JournalId`.
- [ ] Manual test that the new line is visible in D365 desktop under the same journal.
- [ ] Strings reviewed.
- [ ] Demoed to the Marmonil warehouse SME and signed off.

---

## 11. Open Questions

1. **Posting** — should the app eventually call the journal-posting service from this screen (similar to US-PIR-001's picking-list post), or stay add-only forever?
2. **Item lookup** — do we have a dedicated items endpoint (e.g., `/data/ReleasedProductsV2`) we should wire into the Item field, or should it stay free-text + scan for v1?
3. **Activity number** — is there a project-WBS endpoint we can use to populate `ActivityNumber` instead of free-text?
4. **Decimal quantities** — confirm which UoMs allow decimals (e.g., M², KG) so the input keypad matches.
5. **Defaults** — should `JournalName` ever differ from `ProjItem`, or is that always fixed for this app?
6. **Permissions** — which AAD roles are allowed to create journal headers vs. lines? (We may need to hide the FAB for read-only users.)

# User Story: Project Item Requirements (Mobile)

| Field | Value |
|---|---|
| **Story ID** | US-PIR-001 |
| **Epic** | Project Issuance — Warehouse Mobile |
| **Module** | Project Management & Accounting (D365 F&O) |
| **Company / Data Area** | USMF |
| **Priority** | High |
| **Story Points (suggested)** | 8 |

---

## 1. User Story

> **As a** warehouse operator using the mobile app
> **I want to** browse open projects, drill into the item requirements of a selected project, and create a picking list for one or more requirement lines directly from my phone
> **So that** I can issue materials to the right project from the floor without going back to a desktop, reducing posting delays and data-entry errors.

---

## 2. Business Context

Today, picking lists against project sales item requirements are created from the D365 F&O desktop client. Warehouse operators have to leave the floor, walk to a workstation, and identify the correct sales order and line number before they can post.

The mobile app already contains an "Issue to Projects" experience (see existing `Project_Issuance_Menu.html` mockup). This story extends that experience by adding a new menu entry called **"Project Item Requirements"** that is wired to live D365 OData endpoints and to the custom `GP_CreatePackingSlipService` for posting.

---

## 3. Scope

### In scope
- New menu item **"Project Item Requirements"** in the mobile app navigation.
- Project list screen sourced from `/data/Projects`.
- Requirement list screen (per project) sourced from `/data/ProjectSalesItemRequirements`.
- Multi-select of requirement lines and posting to `GP_CreatePackingSlipService/postItemReqPickingList`.
- Success / failure feedback and offline-aware error handling.

### Out of scope
- Ad-hoc item journal posting (already covered by a separate story).
- Editing inventory dimensions (site/warehouse/location/batch) — this story posts using the dimensions returned by the requirement line.
- Packing slip generation after the picking list (handled by the standard D365 flow once the picking list is posted).

---

## 4. Navigation Flow

```
Home  →  Projects menu  →  [Project Item Requirements]  ← NEW
              │
              ▼
      Screen 1: Projects List   ←──── GET /data/Projects
              │  (tap a project)
              ▼
      Screen 2: Item Requirements   ←──── GET /data/ProjectSalesItemRequirements?$filter=ProjectId eq '{id}'
              │  (select 1..n lines, tap "Create Picking List")
              ▼
      Screen 3: Confirmation Sheet  (shows selected lines, qty per line)
              │  (tap "POST")
              ▼
      POST /api/services/.../postItemReqPickingList
              │
              ▼
      Screen 4: Success / Error result
```

---

## 5. Screens & UI Requirements

### Screen 1 — Projects List

**Title:** "Project Item Requirements"

**Source:** `GET https://growpath.sandbox.operations.eu.dynamics.com/data/Projects?cross-company=true&$filter=dataAreaId eq 'usmf'`

**Card fields (per project):**

| UI Label | API Field |
|---|---|
| Project ID (header) | `ProjectID` |
| Project Name (title) | `ProjectName` |
| Customer | `CustomerAccount` + `DeliveryName` |
| Stage pill | `ProjectStage` (e.g., InProcess, Completed) |
| Type | `ProjectType` (TimeMaterial / FixedPrice / Investment / Internal) |
| Group | `ProjectGroup` |
| Start date | `StartDate1` or `ActualStartDate` |
| Contract ID (secondary) | `ProjectContractID` |

**Behaviors:**
- **Search bar** filters client-side on `ProjectID`, `ProjectName`, `CustomerAccount`, `DeliveryName`.
- **Filter chips:** `All`, `In Process`, `Completed`, `Recent (≤ 30 days)`.
- **Default sort:** most recent `StartDate1` first.
- Show a **stage pill** colored per stage (Completed = green, InProcess = neon, others = grey).
- Tapping a row navigates to Screen 2 with `ProjectID` as the parameter.

**Empty / error states:**
- No projects returned → "No projects found for USMF." with a retry button.
- Network/API error → toast with the OData error message and a retry button.

---

### Screen 2 — Item Requirements for a Project

**Title:** the selected project's `ProjectName`
**Eyebrow:** `ProjectID` (e.g., `000436`)

**Source:** `GET https://growpath.sandbox.operations.eu.dynamics.com/data/ProjectSalesItemRequirements?cross-company=true&$filter=dataAreaId eq 'usmf' and ProjectId eq '{ProjectID}'`

**Header strip (aggregates calculated client-side):**

| Stat | Calculation |
|---|---|
| Open lines | count where `SalesStatus = 'Backorder'` |
| Partially shipped | count where `RemainInventPhysical < QuantityOrdered` and `RemainInventPhysical > 0` |
| Closed | count where `SalesStatus = 'Delivered'` or `RemainInventPhysical = 0` |

**Requirement row fields:**

| UI Element | API Field |
|---|---|
| Line number (eyebrow) | `LineNum` |
| Sales Order ID (eyebrow) | `SalesId` |
| Product name (title) | `Name` |
| Item number | `ItemId` |
| Category | `ProjectCategoryId` |
| Configuration / Style / Size / Color | `ProductConfigurationId`, `ProductStyleId`, `ProductSizeId`, `ProductColorId` |
| Quantity ordered | `QuantityOrdered` + `SalesUnit` |
| Remaining | `RemainInventPhysical` + `SalesUnit` |
| Requested receipt date | `ReceiptDateRequested` |
| Requested ship date | `ShippingDateRequested` |
| Site (badge) | `ShippingSiteId` |
| Status pill | derived from `SalesStatus` and `RemainInventPhysical` |
| Line property (badge) | `ProjectLinePropertyId` (e.g., Billable) |
| Activity (footer) | `ActivityNumber` |
| Delivery name (footer) | `DeliveryName` |

**Behaviors:**
- Each row has a **checkbox** on the leading edge for multi-select.
- Selecting at least one row reveals a sticky bottom action bar: **"Create Picking List (N selected)"**.
- For each selected row, the user can edit the **Quantity to issue** (default = `RemainInventPhysical`, max = `RemainInventPhysical`, min = 1, integer only).
- Search bar filters by `ItemId`, `Name`, `SalesId`, `LineNum`.
- Filter chips: `All`, `Backorder`, `Partial`, `Closed`.
- Rows where `RemainInventPhysical = 0` are visible but **non-selectable** and dimmed.

---

### Screen 3 — Confirmation Sheet

A bottom sheet that appears when the user taps "Create Picking List":

- **Title:** "Confirm picking list"
- **Subtitle:** `Sales Order: {SalesId}` (or "Multiple sales orders" if selection spans multiple `SalesId`s — see §7 validation rules).
- A compact table listing each selected line: `LineNum`, `ItemId`, qty, `SalesUnit`.
- Optional read-only field: `Packing Slip ID` (left empty by default — D365 will generate one).
- **Primary CTA:** "POST" → calls the API.
- **Secondary CTA:** "Cancel".

---

### Screen 4 — Result

- **Success:** green check, "Picking list posted ✓", show the returned packing slip ID (if any), and the count of lines posted. Two buttons: "Back to project" and "Done".
- **Failure:** red icon, show server message, retry button, copy-to-clipboard for the raw error payload (for support).

---

## 6. API Contracts

### 6.1 List projects
```http
GET /data/Projects?cross-company=true&$filter=dataAreaId eq 'usmf'
Host: growpath.sandbox.operations.eu.dynamics.com
Authorization: Bearer {token}
Accept: application/json
```

Relevant response fields per record: `ProjectID`, `ProjectName`, `CustomerAccount`, `ProjectStage`, `ProjectType`, `ProjectGroup`, `DeliveryName`, `StartDate1`, `ActualStartDate`, `ProjectContractID`, `PostingLevel`, `TimeMeasure`, `BudgetControlInterval`, `BudgetOverrunDefault`.

### 6.2 List item requirements for a project
```http
GET /data/ProjectSalesItemRequirements?cross-company=true&$filter=dataAreaId eq 'usmf' and ProjectId eq '{ProjectID}'
```

Relevant response fields per record: `ProjectId`, `SalesId`, `LineNum`, `ItemId`, `Name`, `QuantityOrdered`, `SalesQuantity`, `RemainInventPhysical`, `SalesUnit`, `SalesPrice`, `PriceUnit`, `NetAmount`, `SalesStatus`, `LineDeliveryType`, `ShippingSiteId`, `ReceiptDateRequested`, `ShippingDateRequested`, `ShipDate`, `ProductConfigurationId`, `ProductStyleId`, `ProductSizeId`, `ProductColorId`, `ProjectCategoryId`, `ProjectLinePropertyId`, `ActivityNumber`, `DeliveryName`.

### 6.3 Post the picking list
```http
POST /api/services/GP_CreatePackingSlipServiceGroup/GP_CreatePackingSlipService/postItemReqPickingList
Host: growpath.sandbox.operations.eu.dynamics.com
Authorization: Bearer {token}
Content-Type: application/json
```

**Request body** (built from the user's selection):
```json
{
  "_request": {
    "DataAreaId": "USMF",
    "SalesOrderID": "002133",
    "packingSlipId": "",
    "salesLineNum": [1, 2, 3],
    "packingSlipQty": [1000, 500, 250]
  }
}
```

**Field mapping:**

| Body field | Source |
|---|---|
| `DataAreaId` | always `"USMF"` for this story (config-driven later) |
| `SalesOrderID` | `SalesId` of the selected requirement lines (must all share the same `SalesId`) |
| `packingSlipId` | empty — D365 generates |
| `salesLineNum[]` | `LineNum` of each selected requirement, in order |
| `packingSlipQty[]` | user-entered qty per line (defaults to `RemainInventPhysical`), in the **same order** as `salesLineNum` |

---

## 7. Validation Rules

1. The user **must select at least one line** before the "Create Picking List" button is enabled.
2. All selected lines **must share the same `SalesId`**. If a user attempts to mix sales orders, show inline error: *"Picking lists can only group lines from the same sales order. Deselect lines or create separate picking lists."*
3. For each selected line: `1 ≤ packingSlipQty ≤ RemainInventPhysical`. Lines failing this rule block the POST and are highlighted in the confirmation sheet.
4. `packingSlipQty` is an integer (no decimals) — match the UoM behavior of `SalesUnit`. (To revisit if decimal-unit items appear in scope.)
5. The two arrays `salesLineNum` and `packingSlipQty` must be the **same length** and **same order** when sent.
6. Token expired → silently refresh once; if it still fails, redirect the user to re-authenticate.

---

## 8. Acceptance Criteria

**AC1 — Menu entry exists**
- Given I am on the mobile home screen, when I open the Projects section, then I see a "Project Item Requirements" menu item.

**AC2 — Projects list loads from the live API**
- Given I tap "Project Item Requirements", when the screen opens, then the app calls `GET /data/Projects?cross-company=true&$filter=dataAreaId eq 'usmf'` and renders each project as a row showing `ProjectID`, `ProjectName`, `CustomerAccount`, `ProjectStage`, and `StartDate1`.

**AC3 — Projects list handles errors**
- Given the API returns a non-2xx response, when the screen loads, then I see an inline error with the OData error message and a Retry button.

**AC4 — Drill into a project**
- Given the projects list is shown, when I tap a row, then I navigate to the requirements screen for that project and the app calls `GET /data/ProjectSalesItemRequirements?cross-company=true&$filter=dataAreaId eq 'usmf' and ProjectId eq '{ProjectID}'`.

**AC5 — Requirement rows show the right fields**
- Given the requirements API returns at least one record, when the list renders, then each row shows `Name`, `ItemId`, `QuantityOrdered`, `RemainInventPhysical`, `SalesUnit`, status pill, `SalesId`, `LineNum`, and the requested ship date.

**AC6 — Selection and qty edit**
- Given a row with `RemainInventPhysical > 0`, when I tap its checkbox, then it becomes selected and a qty stepper appears with the default value `RemainInventPhysical`, capped at `RemainInventPhysical`.
- Given a row with `RemainInventPhysical = 0`, when I view it, then its checkbox is disabled.

**AC7 — Same-SalesId enforcement**
- Given I have selected one or more lines from `SalesId = A`, when I try to select a line from `SalesId = B`, then the second selection is rejected with an inline message explaining the rule.

**AC8 — Confirmation sheet**
- Given I have at least one selected line, when I tap "Create Picking List", then a confirmation sheet appears listing each selected line (`LineNum`, `ItemId`, qty, `SalesUnit`) and the `SalesId`.

**AC9 — Posting**
- Given the confirmation sheet is shown, when I tap "POST", then the app calls `POST /api/services/GP_CreatePackingSlipServiceGroup/GP_CreatePackingSlipService/postItemReqPickingList` with the body shape defined in §6.3, using the selected `SalesId`, `LineNum` array, and qty array.

**AC10 — Success feedback**
- Given the post call returns a 2xx response, when it completes, then I see a success screen with "Picking list posted ✓", the packing slip identifier (if returned), and the count of posted lines. Tapping "Back to project" returns me to Screen 2 with the list refreshed from the API (so `RemainInventPhysical` reflects the new state).

**AC11 — Failure feedback**
- Given the post call returns a non-2xx response, when it completes, then I see an error screen with the server's message, a Retry button (re-posts the same body), and a "Copy details" button that copies the full error payload to the clipboard.

**AC12 — Loading and offline**
- Given a network request is in-flight, when I wait, then the relevant screen shows a skeleton/spinner state and disables submit buttons.
- Given the device is offline, when I try to open Project Item Requirements, then I see an offline banner and the last successfully-cached project list (if any) with a clear "Offline — last updated HH:MM" indicator.

---

## 9. Non-functional Requirements

- **Performance:** Projects list TTI ≤ 2 s on a 4G connection with 200 records; requirements list TTI ≤ 1.5 s with 100 lines.
- **Auth:** OAuth2 client-credentials/auth-code flow against the D365 tenant; token cached securely (Keychain / Keystore).
- **Pagination:** Use OData `$top=100&$skip=...` if response exceeds 100 records; infinite-scroll on both list screens.
- **Telemetry:** Log every POST attempt with timestamp, user, `SalesId`, line count, and HTTP status. PII-safe.
- **Localization:** English first; structure strings for future Arabic (RTL-safe) localization.

---

## 10. Definition of Done

- [ ] All acceptance criteria pass on iOS and Android.
- [ ] OData and custom-service endpoints are wired and configurable per environment (sandbox / UAT / prod).
- [ ] Unit tests cover the request-body builder (`buildPickingListBody(selectedLines)`), including the same-`SalesId` validation and the array-ordering invariant.
- [ ] Integration test posts a real picking list in the sandbox and verifies `RemainInventPhysical` decreases by the posted qty.
- [ ] Error states reviewed by Support.
- [ ] Strings reviewed for clarity.
- [ ] Story demoed to the Marmonil warehouse SME and signed off.

---

## 11. Open Questions

1. Should the app also allow setting a custom `packingSlipId`, or is server-generated always desired?
2. Are decimal quantities possible for any item (e.g., KG, M²)? If yes, qty input must allow decimals and we need to confirm the service accepts them.
3. Should we expose the **packing slip posting** (next step after picking list) on the same success screen, or keep it as a separate story?
4. Do we need a permission check on the mobile side (which AAD roles can post a picking list)?

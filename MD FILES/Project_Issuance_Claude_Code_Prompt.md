# Project Issuance Menu — Claude Code Prompt
## (Storekeeper issues items to Projects from the mobile app)

> **For:** Existing Angular + Ionic mobile app (warehouse / inventory module)
> **Stack:** Angular 16+, Ionic 7 or 8, Capacitor 5+
> **Prerequisite:** The **Design System** has been built and merged. `src/app/shared/design-system/` exists with all wrapper components, tokens, and light/dark theme support.
> **Goal:** Build the **Project Issuance** feature end-to-end — a 4-page flow that lets a Storekeeper view open projects, drill into item requirements, post a picking list (and optional packing slip), and post an ad-hoc item journal — all from the mobile device, posting to **Dynamics 365 F&O**.
> **Output:** Working pages in the Inventory module, in **light and dark** themes, on **iOS and Material** modes.

---

## How to use this file

1. Copy the static UI reference mockup into the repo:
   - `docs/design-references/Project_Issuance_Menu.html`
2. Copy the user-stories document:
   - `docs/User_Story_Project_Item_Issuance.docx`
3. Open Claude Code in your project root.
4. Make sure the **Master Project Prompt** has been sent once in this session.
5. Make sure the **Design System** PR is merged to your working branch.
6. Paste the prompt below as your next message.
7. Replace `[BRACKETS]` with real values before sending.

---

## What this prompt builds

Four pages + two modals + one shared state file:

| # | Page | Purpose |
|---|---|---|
| 1 | **Project List** | Browse open projects (search + filter chips + FAB for ad-hoc) |
| 2 | **Project Detail** | Project header + tabs + open item requirements |
| 3 | **Issue from Requirement** | Post picking list with qty + dimensions + posting options |
| 4 | **Ad-hoc Issuance** | Post a project item journal with no prior requirement |

Plus:
- **Requirement Action Sheet** (bottom sheet: "Post Picking List" / "Post Picking List + Packing Slip" / "View Details")
- **Post Success Modal** (with summary rows: project, item, qty, journal #, packing slip status)

---

## The Prompt

````
Build the Project Issuance feature end-to-end inside the Inventory
module. Use ONLY the Design System we already built.

## CONTEXT

- App: Angular + Ionic + Capacitor (versions per the DS environment
  summary from earlier).
- Design System path: `src/app/shared/design-system/`.
  All wrapper components, tokens, light/dark theming, and the
  ThemeService are already in place.
- Reference UI mockup (visual source of truth, NOT to be shipped):
    `[REFS_PATH]/Project_Issuance_Menu.html`
- User Stories (functional source of truth):
    `[USER_STORIES_DOC]` (e.g.,
    `docs/User_Story_Project_Item_Issuance.docx`).
  Read it before doing anything else — there are TWO stories that this
  feature implements end-to-end:
    - US-PRJ-01 Issue from Item Requirement (Picking List).
    - US-PRJ-02 Ad-hoc Item Issuance to Project.
- Inventory module: `[INVENTORY_MODULE_PATH]`
  (e.g., `src/app/modules/inventory/`).
- Active company default: `usmf` (configurable via existing settings).
- Backend pattern: same one the Sales module uses
  (`[BACKEND_PATTERN]` — direct OData or existing BFF). MIRROR Sales.

CRITICAL CONSTRAINTS (NON-NEGOTIABLE):
- ALL UI uses ONLY DS components. No bespoke wrappers.
- No hardcoded colors, sizes, radii, shadows in templates or SCSS.
  Tokens only.
- All visible strings go through the existing i18n framework, under
  `inventory.projectIssuance.*`. No hardcoded English.
- Light theme AND dark theme must both look correct. Run the contrast
  test from the DS PR.
- Works on both iOS and Material modes.
- RTL-safe (logical CSS properties only).

## STEP 0 — VERIFY READINESS

Before writing any code, report:
1. DS readiness — list the 25 DS components and confirm each is
   available under `src/app/shared/design-system/components/`. If
   anything is missing, STOP and tell me which.
2. ThemeService — confirm `ThemeService.preference()` returns
   'system' | 'light' | 'dark' and that toggling it actually swaps
   themes in the style guide. If broken, STOP.
3. Sales module — open the Sales module folder and summarize:
    - routing pattern (NgModule vs standalone routes),
    - state-management pattern (signals / RxJS / NgRx),
    - service / API pattern,
    - how it accesses the active company and auth token.
   This is the pattern Project Issuance will follow.
4. Existing backend — name the existing service (Sales API service or
   BFF) you'll extend with Project endpoints. Do NOT introduce a new
   backend stack.

WAIT for my approval before continuing.

## STEP 1 — DATA, TYPES, AND SERVICES

### Models
File: `[INVENTORY_MODULE_PATH]/pages/project-issuance/models.ts`

```ts
export type ProjectStatus = 'InProcess' | 'Closed' | 'OnHold';
export type RequirementStatus = 'Open' | 'Partial' | 'Closed';

export interface Project {
  id: string;                 // e.g., 'MMG-000042'
  name: string;
  customer: string;
  status: ProjectStatus;
  urgent: boolean;
  recent: boolean;
  openCount: number;
  partialCount: number;
  closedCount: number;
}

export interface ProjectRequirement {
  id: string;                 // line identifier
  projectId: string;
  itemNumber: string;         // e.g., '400-2004-030'
  product: string;
  category: string;
  requiredQty: number;
  remainingQty: number;
  uom: string;
  requestedReceiptDate: string;  // ISO
  status: RequirementStatus;
  lineProperty: string;
}

export interface PickingListPayload {
  dataAreaId: string;
  projectId: string;
  requirementId: string;
  lineNumber: number;
  itemNumber: string;
  quantityToIssue: number;
  unit: string;
  site: string;
  warehouse: string;
  location?: string;
  batchNumber?: string;
  serialNumber?: string;
  postPackingSlip: boolean;
  printLabel: boolean;
}

export interface AdhocIssuancePayload {
  dataAreaId: string;
  projectId: string;
  journalName: string;        // e.g., 'ProjItem'
  line: {
    itemNumber: string;
    quantity: number;
    unit: string;
    site: string;
    warehouse: string;
    location?: string;
    batchNumber?: string;
    serialNumber?: string;
    categoryId: string;
    activityNumber: string;
    linePropertyId: string;
  };
}

export interface PostResult {
  success: boolean;
  journalNumber?: string;
  pickingListPosted?: boolean;
  packingSlipPosted?: boolean;
  errorMessage?: string;
}
```

### API service
File: `[INVENTORY_MODULE_PATH]/pages/project-issuance/project-issuance-api.service.ts`

Methods (mirror Sales pattern; use existing HTTP/Auth services):

```ts
@Injectable({ providedIn: 'root' })
export class ProjectIssuanceApiService {
  // List
  getOpenProjects(dataAreaId: string): Observable<Project[]>;

  // Detail
  getProject(dataAreaId: string, id: string): Observable<Project>;
  getRequirements(dataAreaId: string, projectId: string): Observable<ProjectRequirement[]>;

  // Post Picking List (US-PRJ-01)
  postPickingList(payload: PickingListPayload): Observable<PostResult>;

  // Post Ad-hoc Item Journal (US-PRJ-02)
  postAdhocItemJournal(payload: AdhocIssuancePayload): Observable<PostResult>;
}
```

Backend endpoints:
- `getOpenProjects` → OData `/data/Projects?cross-company=true&$filter=dataAreaId eq '{c}' and ProjectStage eq 'InProcess'` (confirm entity name from `/data/$metadata`).
- `getRequirements` → OData `/data/ProjectItemRequirements?cross-company=true&$filter=dataAreaId eq '{c}' and ProjectID eq '{p}' and RemainingQuantity gt 0`.
- `postPickingList` → custom service endpoint (NOT standard OData);
   the picking-list posting is an X++ operation. Use the existing
   BFF/custom-service pattern. If a wrapper service doesn't exist yet,
   add a STUB endpoint in the BFF skeleton or document it as a
   follow-up — the mobile work must not assume direct OData here.
- `postAdhocItemJournal` → custom service endpoint that creates +
   posts a Project Item Journal in one atomic call.

If any of these endpoints aren't ready on the backend yet, mock them
behind a feature flag `FF_PROJECT_ISSUANCE_USE_MOCK` (default true)
that returns the mocked data + simulated 1s delay. Real API calls
gated behind the flag being false.

### Mock data
For dev mode, hardcode 5 projects and their requirements extracted
verbatim from `[REFS_PATH]/Project_Issuance_Menu.html`:
- MMG-000042 Open Air Mall (Marmonil Trading) — 4 requirements
- MMG-000038 Cairo Tower Renovation (Egyptian Heritage Authority) — 2
- MMG-000035 New Capital Residential Tower (NCRT Development) — 1
- MMG-000030 Alexandria Library Expansion (Bibliotheca Alexandrina) — 1
- MMG-000028 Red Sea Resort Phase 2 (RSR Holdings) — 1

### Shared state
File: `[INVENTORY_MODULE_PATH]/pages/project-issuance/project-issuance.state.ts`

```ts
@Injectable({ providedIn: 'root' })
export class ProjectIssuanceState {
  readonly projects = signal<Project[]>([]);
  readonly loading  = signal<boolean>(false);
  readonly error    = signal<string | null>(null);

  readonly currentProject     = signal<Project | null>(null);
  readonly currentRequirement = signal<ProjectRequirement | null>(null);

  readonly searchQuery  = signal<string>('');
  readonly activeFilter = signal<'all' | 'urgent' | 'open' | 'recent'>('all');

  // Posting state (for re-entry / pending sync)
  readonly lastPostResult = signal<PostResult | null>(null);

  // Computed
  readonly visibleProjects = computed(() => /* filter + search */);
  readonly stats = computed(() => /* {openProjects, openReqs, company} */);
}
```

WAIT FOR APPROVAL of the data shapes + service surface before
continuing.

## STEP 2 — ROUTING

Add the routes to the existing Inventory routing module (or
standalone routes file — match the existing pattern):

```ts
{
  path: 'project-issuance',
  canActivate: [FeatureFlagGuard('FF_PROJECT_ISSUANCE')],
  loadChildren: () =>
    import('./pages/project-issuance/project-issuance.routes')
      .then(m => m.PROJECT_ISSUANCE_ROUTES)
}
```

Inner routes:

```
''                                    → ProjectListPage
':projectId'                          → ProjectDetailPage
':projectId/issue/:requirementId'     → IssueFromRequirementPage
'adhoc'                               → AdhocIssuancePage  (FAB entry)
':projectId/adhoc'                    → AdhocIssuancePage  (in-project entry)
```

Feature flag `FF_PROJECT_ISSUANCE` (default true). Read from existing
config service.

## STEP 3 — INVENTORY HOME TILE

Add a tile to `InventoryHomePage`:
- Icon: `apps` (Ionicons) or a project-themed icon used by the host app.
- Title: `inventory.projectIssuance.tile.title`.
- Subtitle: `inventory.projectIssuance.tile.subtitle`.
- Routes to `/inventory/project-issuance`.
- Tile is hidden when `FF_PROJECT_ISSUANCE` is false.

Match the visual treatment of other transaction tiles on that page.

## STEP 4 — PAGE 1: PROJECT LIST

### Files
```
pages/project-issuance/project-list/
├── project-list.page.ts
├── project-list.page.html
├── project-list.page.scss
└── project-list.page.spec.ts
```

### Template (use only DS components)

```html
<ds-page>
  <ng-container header>
    <ds-toolbar [title]="'inventory.projectIssuance.list.toolbar' | translate"
                [showBack]="true"
                (back)="goBack()">
    </ds-toolbar>
  </ng-container>

  <ds-hero
    [badge]="{ text: 'inventory.projectIssuance.list.badge' | translate, pulse: true }"
    [title]="'inventory.projectIssuance.list.heading' | translate"
    [accentWord]="'inventory.projectIssuance.list.accentWord' | translate"
    [subtitle]="'inventory.projectIssuance.list.subtitle' | translate"
    [stats]="state.stats()">
  </ds-hero>

  <ds-search
    [placeholder]="'inventory.projectIssuance.list.searchPh' | translate"
    [debounceMs]="150"
    (query)="onSearch($event)">
  </ds-search>

  <ds-chip-row
    [chips]="filterChips()"
    [multiSelect]="false"
    (change)="onFilter($event)">
  </ds-chip-row>

  <ng-container *ngIf="!state.loading() && state.visibleProjects().length; else loadingOrEmpty">
    <ds-list-row
      *ngFor="let p of state.visibleProjects(); trackBy: trackProject"
      [icon]="p.urgent ? 'flame' : 'apps'"
      [id]="p.id"
      [title]="p.name"
      [meta]="metaFor(p) | translate:metaParamsFor(p)"
      (activate)="openProject(p)">
      <ds-pill *ngIf="p.urgent" slot="trailing"
               variant="warning"
               [text]="'inventory.projectIssuance.list.pill.urgent' | translate">
      </ds-pill>
      <ds-pill *ngIf="!p.urgent" slot="trailing"
               variant="open"
               [text]="'inventory.projectIssuance.list.pill.inProcess' | translate">
      </ds-pill>
    </ds-list-row>
  </ng-container>

  <ng-template #loadingOrEmpty>
    <ng-container *ngIf="state.loading()">
      <ion-skeleton-text *ngFor="let i of [1,2,3]"
                         animated
                         style="margin: 12px 16px; height: 92px; border-radius: 16px;">
      </ion-skeleton-text>
    </ng-container>
    <ds-empty-state *ngIf="!state.loading()"
      icon="search"
      [message]="'inventory.projectIssuance.list.empty.message' | translate"
      [hint]="'inventory.projectIssuance.list.empty.hint' | translate">
    </ds-empty-state>
  </ng-template>

  <ds-fab icon="add"
          [tooltip]="'inventory.projectIssuance.list.fabTooltip' | translate"
          (action)="goAdhoc()">
  </ds-fab>
</ds-page>
```

### Behaviors
- On `ngOnInit`: load projects via API service (or mock).
- Pull-to-refresh: wrap content in `ion-refresher`; refresh on pull.
- Search filter: client-side over `id`, `name`, `customer`.
- Filter chips: All / Urgent (urgent=true) / In Process (status='InProcess') / Recent (recent=true).
- Tap row: navigate to `/inventory/project-issuance/{id}`.
- FAB tap: navigate to `/inventory/project-issuance/adhoc` (no project preselected).

## STEP 5 — PAGE 2: PROJECT DETAIL

### Files
```
pages/project-issuance/project-detail/
├── project-detail.page.ts
├── project-detail.page.html
├── project-detail.page.scss
└── project-detail.page.spec.ts
```

### Template

```html
<ds-page>
  <ng-container header>
    <ds-toolbar
      [eyebrow]="'inventory.projectIssuance.detail.eyebrow' | translate"
      [title]="state.currentProject()?.name"
      [showBack]="true"
      (back)="goBack()">
    </ds-toolbar>
  </ng-container>

  <ds-card variant="default" class="project-header">
    <div class="status-row">
      <span class="project-id">{{ state.currentProject()?.id }}</span>
      <ds-pill variant="open"
               [text]="'inventory.projectIssuance.detail.status.inProcess' | translate">
      </ds-pill>
    </div>
    <h1 class="project-name">{{ state.currentProject()?.name }}</h1>
    <div class="project-customer">
      {{ 'inventory.projectIssuance.detail.customer' | translate:{ name: state.currentProject()?.customer } }}
    </div>

    <div class="project-stats">
      <ds-stat
        [value]="state.currentProject()?.openCount"
        [label]="'inventory.projectIssuance.detail.stats.open' | translate"
        accent="accent">
      </ds-stat>
      <ds-stat
        [value]="state.currentProject()?.partialCount"
        [label]="'inventory.projectIssuance.detail.stats.partial' | translate"
        accent="warning">
      </ds-stat>
      <ds-stat
        [value]="state.currentProject()?.closedCount"
        [label]="'inventory.projectIssuance.detail.stats.closed' | translate"
        accent="info">
      </ds-stat>
    </div>
  </ds-card>

  <ds-tabs
    [tabs]="tabs()"
    [activeId]="activeTab()"
    (change)="setActiveTab($event)">
  </ds-tabs>

  <ng-container [ngSwitch]="activeTab()">
    <ng-container *ngSwitchCase="'requirements'">
      <ds-card *ngFor="let r of requirements(); trackBy: trackReq"
               variant="default"
               class="req-card"
               (click)="openRequirementAction(r)">
        <div class="req-head">
          <div>
            <div class="req-item-num">
              {{ r.itemNumber }}  ·  {{ r.category }}
            </div>
            <div class="req-product">{{ r.product }}</div>
          </div>
          <ds-pill [variant]="r.status === 'Open' ? 'open' : 'partial'"
                   [text]="('inventory.projectIssuance.detail.reqStatus.' + r.status) | translate">
          </ds-pill>
        </div>

        <div class="req-meta">
          <ds-stat-inline
            [label]="'inventory.projectIssuance.detail.req.required' | translate"
            [value]="format(r.requiredQty, r.uom)">
          </ds-stat-inline>
          <ds-stat-inline
            [label]="'inventory.projectIssuance.detail.req.remaining' | translate"
            [value]="format(r.remainingQty, r.uom)"
            accent="accent">
          </ds-stat-inline>
          <ds-stat-inline
            [label]="'inventory.projectIssuance.detail.req.due' | translate"
            [value]="r.requestedReceiptDate | date:'shortDate'"
            accent="warning">
          </ds-stat-inline>
        </div>

        <ds-progress [percent]="percentDone(r)"></ds-progress>
      </ds-card>
    </ng-container>

    <ng-container *ngSwitchCase="'history'">
      <ds-empty-state
        icon="time"
        [message]="'inventory.projectIssuance.detail.history.empty' | translate"
        [hint]="'inventory.projectIssuance.detail.history.emptyHint' | translate">
      </ds-empty-state>
    </ng-container>

    <ng-container *ngSwitchCase="'info'">
      <!-- read-only project info table; out of scope for v1 -->
      <ds-empty-state
        icon="information-circle"
        [message]="'inventory.projectIssuance.detail.info.placeholder' | translate">
      </ds-empty-state>
    </ng-container>
  </ng-container>

  <ng-container footer>
    <ds-cta-bar
      [secondary]="{ label: 'inventory.projectIssuance.detail.cta.back' | translate }"
      [primary]="{ label: 'inventory.projectIssuance.detail.cta.adhoc' | translate, icon: 'add' }"
      (secondaryClick)="goBack()"
      (primaryClick)="goAdhocInProject()">
    </ds-cta-bar>
  </ng-container>
</ds-page>
```

Note: `ds-stat-inline` is a small variant used here for the
horizontal mini-stat fields. If not present in DS, request it as a
new DS component in a follow-up PR. Until then, render it from
`ds-stat` with `size="sm"` — only if the DS supports a size input.
If neither exists, FLAG IT — do NOT inline custom styles.

### Behaviors
- On enter with `:projectId` param: load project + requirements.
- Tabs (Requirements / History / Info): client-side switch via signal.
  Default = Requirements. History and Info are placeholders for v1.
- Tap a requirement → open Action Sheet (Step 6).
- "+ Ad-hoc Item" CTA → navigate to `:projectId/adhoc`.

## STEP 6 — REQUIREMENT ACTION SHEET

A bottom sheet shown when the user taps a requirement row.

### Files
```
pages/project-issuance/components/
└── requirement-action-sheet.component.ts
```

### Template
```html
<ds-bottom-sheet
  [open]="open()"
  (close)="close.emit()">
  <ds-sheet-header
    [title]="requirement()?.product"
    [subtitle]="
      requirement()?.itemNumber + ' · ' +
      ('inventory.projectIssuance.actionSheet.remaining' | translate:{
        qty: requirement()?.remainingQty,
        uom: requirement()?.uom
      })
    ">
  </ds-sheet-header>

  <ds-action-list>
    <ds-action-item
      icon="document-text"
      [title]="'inventory.projectIssuance.actionSheet.postPicking' | translate"
      [description]="'inventory.projectIssuance.actionSheet.postPickingDesc' | translate"
      (activate)="choose('picking')">
    </ds-action-item>

    <ds-action-item
      icon="cube"
      [title]="'inventory.projectIssuance.actionSheet.postPickingAndPacking' | translate"
      [description]="'inventory.projectIssuance.actionSheet.postPickingAndPackingDesc' | translate"
      (activate)="choose('pickingAndPacking')">
    </ds-action-item>

    <ds-action-item
      icon="settings"
      [title]="'inventory.projectIssuance.actionSheet.viewDetails' | translate"
      [description]="'inventory.projectIssuance.actionSheet.viewDetailsDesc' | translate"
      (activate)="choose('details')">
    </ds-action-item>
  </ds-action-list>
</ds-bottom-sheet>
```

Note: `ds-sheet-header`, `ds-action-list`, `ds-action-item` are part of
the DS. If they don't exist yet, request them as additions to the DS
PR before continuing — do NOT inline styles.

### Behavior
- `'picking'` → navigate to issue page with `postPackingSlip=false`.
- `'pickingAndPacking'` → same page with `postPackingSlip=true`.
- `'details'` → same page (operator can review/edit before posting).

## STEP 7 — PAGE 3: ISSUE FROM REQUIREMENT

### Files
```
pages/project-issuance/issue-from-requirement/
├── issue-from-requirement.page.ts
├── issue-from-requirement.page.html
├── issue-from-requirement.page.scss
└── issue-from-requirement.page.spec.ts
```

### Template

```html
<ds-page>
  <ng-container header>
    <ds-toolbar
      [eyebrow]="'inventory.projectIssuance.issue.eyebrow' | translate"
      [title]="'inventory.projectIssuance.issue.title' | translate"
      [showBack]="true"
      [rightIcon]="'qr-code'"
      (back)="goBack()"
      (rightAction)="onScan()">
    </ds-toolbar>
  </ng-container>

  <form [formGroup]="form">

    <!-- Card 1: Item Information (read-only) -->
    <ds-card>
      <ds-card-title text="› {{ 'inventory.projectIssuance.issue.cards.item' | translate }}"></ds-card-title>

      <ds-form-field [label]="'inventory.projectIssuance.issue.fields.product' | translate" full>
        <ds-input variant="readonly" formControlName="product"></ds-input>
      </ds-form-field>

      <div class="grid-2">
        <ds-form-field [label]="'inventory.projectIssuance.issue.fields.itemNumber' | translate">
          <ds-input variant="readonly" formControlName="itemNumber"></ds-input>
        </ds-form-field>

        <ds-form-field [label]="'inventory.projectIssuance.issue.fields.category' | translate">
          <ds-input variant="readonly" formControlName="category"></ds-input>
        </ds-form-field>
      </div>
    </ds-card>

    <!-- Card 2: Quantity -->
    <ds-card>
      <ds-card-title text="› {{ 'inventory.projectIssuance.issue.cards.qty' | translate }}"></ds-card-title>

      <ds-qty-stepper
        formControlName="quantity"
        [min]="0"
        [max]="state.currentRequirement()?.remainingQty || 0"
        [step]="qtyStep()">
      </ds-qty-stepper>

      <div class="qty-helper">
        <span class="hint-warning">
          {{ 'inventory.projectIssuance.issue.helper.remaining' | translate:
             { qty: (state.currentRequirement()?.remainingQty | number) } }}
        </span>
        <span class="hint-sep">·</span>
        <span class="hint-info">
          {{ 'inventory.projectIssuance.issue.helper.onHand' | translate:
             { qty: (onHand() | number), uom: state.currentRequirement()?.uom } }}
        </span>
      </div>
    </ds-card>

    <!-- Card 3: Inventory Dimensions -->
    <ds-card>
      <ds-card-title text="› {{ 'inventory.projectIssuance.issue.cards.dims' | translate }}"></ds-card-title>

      <div class="grid-2">
        <ds-form-field [label]="'inventory.projectIssuance.issue.fields.site' | translate" required>
          <ds-input formControlName="site"></ds-input>
        </ds-form-field>

        <ds-form-field [label]="'inventory.projectIssuance.issue.fields.warehouse' | translate" required>
          <ds-input formControlName="warehouse"></ds-input>
        </ds-form-field>

        <ds-form-field [label]="'inventory.projectIssuance.issue.fields.location' | translate">
          <ds-input formControlName="location"
                    [placeholder]="'inventory.projectIssuance.issue.fields.locationPh' | translate">
          </ds-input>
        </ds-form-field>

        <ds-form-field [label]="'inventory.projectIssuance.issue.fields.batch' | translate">
          <ds-input formControlName="batch"></ds-input>
        </ds-form-field>
      </div>

      <ds-scan-button
        [label]="'inventory.projectIssuance.issue.scanCta' | translate"
        (scan)="onLocationScan($event)">
      </ds-scan-button>
    </ds-card>

    <!-- Card 4: Posting Options -->
    <ds-card>
      <ds-card-title text="› {{ 'inventory.projectIssuance.issue.cards.options' | translate }}"></ds-card-title>

      <ds-toggle-row
        [title]="'inventory.projectIssuance.issue.toggle.packingSlip' | translate"
        [sub]="'inventory.projectIssuance.issue.toggle.packingSlipSub' | translate"
        formControlName="postPackingSlip">
      </ds-toggle-row>

      <ds-toggle-row
        [title]="'inventory.projectIssuance.issue.toggle.printLabel' | translate"
        [sub]="'inventory.projectIssuance.issue.toggle.printLabelSub' | translate"
        formControlName="printLabel">
      </ds-toggle-row>
    </ds-card>

  </form>

  <ng-container footer>
    <ds-cta-bar
      [secondary]="{ label: 'inventory.projectIssuance.issue.cta.cancel' | translate }"
      [primary]="{
        label: 'inventory.projectIssuance.issue.cta.post' | translate,
        icon: 'checkmark',
        disabled: !form.valid || form.value.quantity <= 0,
        loading: posting()
      }"
      (secondaryClick)="goBack()"
      (primaryClick)="onPost()">
    </ds-cta-bar>
  </ng-container>
</ds-page>
```

### Behavior
- On enter: read `:projectId` and `:requirementId` from the route,
  load both, populate the form with defaults:
    - product/itemNumber/category from requirement,
    - quantity = `remainingQty`,
    - site/warehouse from requirement defaults or user's selected
      warehouse,
    - location/batch empty,
    - `postPackingSlip` from query param (default false),
    - `printLabel` = false.
- Validation:
    - quantity ≥ 1 and ≤ `remainingQty`,
    - site required,
    - warehouse required,
    - batch/serial required IF the item is batch/serial tracked (look
      up from released-product master if available, or check a flag
      on the requirement model).
- POST flow:
    1. Disable form, show loading on primary CTA.
    2. Call `apiService.postPickingList(payload)`.
    3. On success: open `PostSuccessModal` (Step 9) with type='picking'.
    4. On failure: surface the actual error message in a toast and
       keep the form editable for retry.

## STEP 8 — PAGE 4: AD-HOC ISSUANCE

### Files
```
pages/project-issuance/adhoc-issuance/
├── adhoc-issuance.page.ts
├── adhoc-issuance.page.html
├── adhoc-issuance.page.scss
└── adhoc-issuance.page.spec.ts
```

### Template

```html
<ds-page>
  <ng-container header>
    <ds-toolbar
      [eyebrow]="'inventory.projectIssuance.adhoc.eyebrow' | translate"
      [title]="'inventory.projectIssuance.adhoc.title' | translate"
      [showBack]="true"
      [rightIcon]="'qr-code'"
      (back)="goBack()"
      (rightAction)="onScan()">
    </ds-toolbar>
  </ng-container>

  <form [formGroup]="form">

    <!-- Card 1: Target Project -->
    <ds-card>
      <ds-card-title text="› {{ 'inventory.projectIssuance.adhoc.cards.project' | translate }}"></ds-card-title>
      <ds-form-field
        [label]="'inventory.projectIssuance.adhoc.fields.project' | translate"
        required
        [helper]="'inventory.projectIssuance.adhoc.fields.projectHelper' | translate"
        full>
        <ds-input formControlName="projectId"
                  [placeholder]="'inventory.projectIssuance.adhoc.fields.projectPh' | translate">
        </ds-input>
      </ds-form-field>
    </ds-card>

    <!-- Card 2: Item -->
    <ds-card>
      <ds-card-title text="› {{ 'inventory.projectIssuance.adhoc.cards.item' | translate }}"></ds-card-title>
      <ds-form-field
        [label]="'inventory.projectIssuance.adhoc.fields.itemNumber' | translate"
        required full>
        <ds-input formControlName="itemNumber"
                  [placeholder]="'inventory.projectIssuance.adhoc.fields.itemPh' | translate">
        </ds-input>
      </ds-form-field>
      <ds-scan-button (scan)="onItemScan($event)"
                      [label]="'inventory.projectIssuance.adhoc.scanItemCta' | translate">
      </ds-scan-button>
    </ds-card>

    <!-- Card 3: Quantity + UoM -->
    <ds-card>
      <ds-card-title text="› {{ 'inventory.projectIssuance.adhoc.cards.qty' | translate }}"></ds-card-title>
      <div class="grid-2">
        <ds-form-field [label]="'inventory.projectIssuance.adhoc.fields.qty' | translate" required>
          <ds-input variant="qty" type="number" formControlName="quantity"></ds-input>
        </ds-form-field>
        <ds-form-field [label]="'inventory.projectIssuance.adhoc.fields.uom' | translate" required>
          <ds-input formControlName="unit"></ds-input>
        </ds-form-field>
      </div>
    </ds-card>

    <!-- Card 4: Inventory Dimensions (same fields as Step 7's Card 3) -->
    <ds-card>...</ds-card>

    <!-- Card 5: Project Dimensions -->
    <ds-card>
      <ds-card-title text="› {{ 'inventory.projectIssuance.adhoc.cards.projectDims' | translate }}"></ds-card-title>
      <div class="grid-2">
        <ds-form-field [label]="'inventory.projectIssuance.adhoc.fields.category' | translate" required>
          <ds-input formControlName="categoryId"></ds-input>
        </ds-form-field>
        <ds-form-field [label]="'inventory.projectIssuance.adhoc.fields.activity' | translate" required>
          <ds-input formControlName="activityNumber"></ds-input>
        </ds-form-field>
      </div>
      <ds-form-field [label]="'inventory.projectIssuance.adhoc.fields.lineProperty' | translate" required full>
        <ds-input formControlName="linePropertyId"></ds-input>
      </ds-form-field>
    </ds-card>

  </form>

  <ng-container footer>
    <ds-cta-bar
      [secondary]="{ label: 'inventory.projectIssuance.adhoc.cta.cancel' | translate }"
      [primary]="{
        label: 'inventory.projectIssuance.adhoc.cta.post' | translate,
        icon: 'checkmark',
        disabled: !form.valid,
        loading: posting()
      }"
      (secondaryClick)="goBack()"
      (primaryClick)="onPost()">
    </ds-cta-bar>
  </ng-container>
</ds-page>
```

### Behavior
- Two entry points:
    a. From the list-page FAB → no project preselected; user types
       or scans the project.
    b. From the project detail's "+ Ad-hoc Item" CTA → `projectId`
       prefilled and readonly.
- Validation:
    - projectId required (and must exist; client-side check against
      loaded projects + server-side check on submit),
    - itemNumber required,
    - quantity > 0,
    - unit required,
    - site, warehouse required,
    - category, activity, lineProperty required.
- Defaults for category/activity/lineProperty come from the selected
  project's setup (if available — otherwise empty).
- POST flow: same pattern as Step 7 but calls
  `apiService.postAdhocItemJournal(payload)` and surfaces a different
  success modal (`type='adhoc'`).

## STEP 9 — POST SUCCESS MODAL

A bottom-sheet (`ds-bottom-sheet`) that shows the result after a
successful post.

### Files
```
pages/project-issuance/components/
└── post-success.modal.ts
```

### Template
```html
<ds-bottom-sheet [open]="open()" (close)="onClose()">
  <ds-success-state
    [title]="title()"
    [message]="message()"
    [summary]="summaryRows()">
  </ds-success-state>

  <div class="modal-actions">
    <ds-button variant="ghost" expand="block" (action)="onDone()">
      {{ 'inventory.projectIssuance.success.cta.done' | translate }}
    </ds-button>
    <ds-button variant="primary" expand="block" (action)="onViewProject()">
      {{ 'inventory.projectIssuance.success.cta.viewProject' | translate }}
    </ds-button>
  </div>
</ds-bottom-sheet>
```

### Summary content

For type=`'picking'`:
- Project (id)
- Item (number)
- Quantity (with accent color = neon)
- Picking List (✓ Posted)
- Packing Slip (✓ Posted | Skipped)
- Journal # (from response)

For type=`'adhoc'`:
- Project (id)
- Item (number)
- Quantity (with accent color)
- Journal Type ("Proj.Item")
- Journal # (from response, with accent = success green)

### Behavior
- "Done" → close modal, navigate back to ProjectListPage.
- "View Project" → close modal, navigate back to the project detail.

## STEP 10 — i18n KEYS

Add ALL these keys to the existing translation files. English values
come verbatim from `[REFS_PATH]/Project_Issuance_Menu.html`.

```
inventory.projectIssuance.tile.title
inventory.projectIssuance.tile.subtitle

inventory.projectIssuance.list.toolbar
inventory.projectIssuance.list.badge
inventory.projectIssuance.list.heading
inventory.projectIssuance.list.accentWord
inventory.projectIssuance.list.subtitle
inventory.projectIssuance.list.searchPh
inventory.projectIssuance.list.fabTooltip
inventory.projectIssuance.list.pill.urgent
inventory.projectIssuance.list.pill.inProcess
inventory.projectIssuance.list.stats.openProjects
inventory.projectIssuance.list.stats.openReqs
inventory.projectIssuance.list.stats.company
inventory.projectIssuance.list.filters.all
inventory.projectIssuance.list.filters.urgent
inventory.projectIssuance.list.filters.open
inventory.projectIssuance.list.filters.recent
inventory.projectIssuance.list.empty.message
inventory.projectIssuance.list.empty.hint
inventory.projectIssuance.list.meta.openPartial

inventory.projectIssuance.detail.eyebrow
inventory.projectIssuance.detail.customer
inventory.projectIssuance.detail.status.inProcess
inventory.projectIssuance.detail.stats.open
inventory.projectIssuance.detail.stats.partial
inventory.projectIssuance.detail.stats.closed
inventory.projectIssuance.detail.tabs.requirements
inventory.projectIssuance.detail.tabs.history
inventory.projectIssuance.detail.tabs.info
inventory.projectIssuance.detail.reqStatus.Open
inventory.projectIssuance.detail.reqStatus.Partial
inventory.projectIssuance.detail.reqStatus.Closed
inventory.projectIssuance.detail.req.required
inventory.projectIssuance.detail.req.remaining
inventory.projectIssuance.detail.req.due
inventory.projectIssuance.detail.cta.back
inventory.projectIssuance.detail.cta.adhoc
inventory.projectIssuance.detail.history.empty
inventory.projectIssuance.detail.history.emptyHint
inventory.projectIssuance.detail.info.placeholder

inventory.projectIssuance.actionSheet.remaining
inventory.projectIssuance.actionSheet.postPicking
inventory.projectIssuance.actionSheet.postPickingDesc
inventory.projectIssuance.actionSheet.postPickingAndPacking
inventory.projectIssuance.actionSheet.postPickingAndPackingDesc
inventory.projectIssuance.actionSheet.viewDetails
inventory.projectIssuance.actionSheet.viewDetailsDesc

inventory.projectIssuance.issue.eyebrow
inventory.projectIssuance.issue.title
inventory.projectIssuance.issue.cards.item
inventory.projectIssuance.issue.cards.qty
inventory.projectIssuance.issue.cards.dims
inventory.projectIssuance.issue.cards.options
inventory.projectIssuance.issue.fields.product
inventory.projectIssuance.issue.fields.itemNumber
inventory.projectIssuance.issue.fields.category
inventory.projectIssuance.issue.fields.site
inventory.projectIssuance.issue.fields.warehouse
inventory.projectIssuance.issue.fields.location
inventory.projectIssuance.issue.fields.locationPh
inventory.projectIssuance.issue.fields.batch
inventory.projectIssuance.issue.helper.remaining
inventory.projectIssuance.issue.helper.onHand
inventory.projectIssuance.issue.scanCta
inventory.projectIssuance.issue.toggle.packingSlip
inventory.projectIssuance.issue.toggle.packingSlipSub
inventory.projectIssuance.issue.toggle.printLabel
inventory.projectIssuance.issue.toggle.printLabelSub
inventory.projectIssuance.issue.cta.cancel
inventory.projectIssuance.issue.cta.post

inventory.projectIssuance.adhoc.eyebrow
inventory.projectIssuance.adhoc.title
inventory.projectIssuance.adhoc.cards.project
inventory.projectIssuance.adhoc.cards.item
inventory.projectIssuance.adhoc.cards.qty
inventory.projectIssuance.adhoc.cards.dims
inventory.projectIssuance.adhoc.cards.projectDims
inventory.projectIssuance.adhoc.fields.project
inventory.projectIssuance.adhoc.fields.projectPh
inventory.projectIssuance.adhoc.fields.projectHelper
inventory.projectIssuance.adhoc.fields.itemNumber
inventory.projectIssuance.adhoc.fields.itemPh
inventory.projectIssuance.adhoc.fields.qty
inventory.projectIssuance.adhoc.fields.uom
inventory.projectIssuance.adhoc.fields.category
inventory.projectIssuance.adhoc.fields.activity
inventory.projectIssuance.adhoc.fields.lineProperty
inventory.projectIssuance.adhoc.scanItemCta
inventory.projectIssuance.adhoc.cta.cancel
inventory.projectIssuance.adhoc.cta.post

inventory.projectIssuance.success.picking.title
inventory.projectIssuance.success.picking.message
inventory.projectIssuance.success.adhoc.title
inventory.projectIssuance.success.adhoc.message
inventory.projectIssuance.success.cta.done
inventory.projectIssuance.success.cta.viewProject
inventory.projectIssuance.success.row.project
inventory.projectIssuance.success.row.item
inventory.projectIssuance.success.row.quantity
inventory.projectIssuance.success.row.pickingList
inventory.projectIssuance.success.row.packingSlip
inventory.projectIssuance.success.row.journalType
inventory.projectIssuance.success.row.journalNumber
inventory.projectIssuance.success.value.posted
inventory.projectIssuance.success.value.skipped
```

Populate English from the references. Stub `__TODO__` for any other
language file the app supports and flag this in the PR.

## STEP 11 — THEME COMPATIBILITY

This feature must look correct in BOTH themes:

- Make sure the ThemeService toggle from the DS PR works on every
  page in this flow.
- Run the contrast test (`theme.contrast.spec.ts` from the DS PR) and
  ensure no regression.
- Specifically verify these visuals in light mode (where neon-on-white
  can fail contrast):
    - Hero `accentWord` (neon → use the light-mode accent token).
    - "Remaining" qty (neon-tinted text).
    - Success modal "Quantity" row.
    - FAB background and shadow.
- For each, the token should automatically swap based on the active
  palette. If any specific page introduces a contrast violation, fix
  it at the TOKEN level — do NOT introduce per-page overrides.

## STEP 12 — TESTING

For each page, at minimum:
- Renders correctly with mocked data.
- Search filters the project list.
- Filter chip narrows results.
- Empty state appears when nothing matches.
- Tapping a project navigates to detail.
- Tapping a requirement opens the action sheet.
- Action sheet routes to the issue page with correct query params.
- Form validation:
    - Picking list: qty ≤ remaining, required fields.
    - Ad-hoc: project + item + qty + dims + project-dims required.
- POST success path: API mock returns success → success modal shows
  correct summary.
- POST failure path: API mock returns error → error toast surfaces.

Snapshot tests in 4 combos (iOS+light, iOS+dark, MD+light, MD+dark)
for: list page, detail page, issue page, adhoc page = 16 snapshots.

One e2e test (Cypress or Playwright — whichever the project uses)
walks the full happy path:
1. Open `/inventory/project-issuance`.
2. Search "Open Air Mall" → tap result.
3. Tap first requirement → action sheet.
4. Pick "Post Picking List + Packing Slip".
5. Form opens with correct defaults.
6. Tap POST → success modal.
7. Tap "View Project" → back to detail with reduced remaining qty.

Repeat in dark mode.

## STEP 13 — VERIFICATION

Run and report after each step + final:
- `npm run lint`
- `npm run typecheck`
- `npm test` (filter to project-issuance)
- `ionic build --prod` (no Ionic warnings).
- Capacitor:
    - `npx cap sync android && npx cap sync ios`
- Visual: capture screenshots in
    list page × (iOS+light, iOS+dark, MD+light, MD+dark),
    detail page × same 4,
    issue page × same 4,
    adhoc page × same 4,
    success modal open × same 4.
  Total: 20 screenshots. Attach to the PR.
- Contrast test passes.
- Hardcoded-value sweep (from DS PR) reports ZERO matches inside
  `pages/project-issuance/`.

## DO BEFORE WRITING CODE

1. Run STEP 0 (DS readiness, ThemeService, Sales pattern, backend).
   Report and WAIT.
2. Run STEP 1 (data shapes and service surface). Report and WAIT.
3. Submit the full PLAN:
   - files to add per page,
   - routing additions,
   - i18n key set (Step 10),
   - InventoryHome tile,
   - expected commits + line counts.
4. WAIT for approval.
5. Implement in this order, committing per step:
   a. Models + state + API service (mock-first behind FF)
   b. i18n keys (Step 10)
   c. Routing additions (Step 2) + InventoryHome tile (Step 3)
   d. ProjectListPage (Step 4) + tests
   e. ProjectDetailPage (Step 5) + tests
   f. Requirement Action Sheet (Step 6)
   g. IssueFromRequirementPage (Step 7) + tests
   h. AdhocIssuancePage (Step 8) + tests
   i. PostSuccessModal (Step 9)
   j. E2E happy path (Step 12)
   k. Final verification (Step 13)

## OUTPUT EXPECTED

1. STEP 0 + STEP 1 reports.
2. The full PLAN.
3. Per-step commits with conventional-commit messages
   (`feat(project-issuance): models and state`,
    `feat(project-issuance): list page`,
    `feat(project-issuance): post-success modal`, etc.).
4. After each step: lint + tests + build results.
5. Final PR with:
   - all 20 screenshots,
   - contrast test results,
   - hardcoded-value sweep results,
   - i18n key list + which language files were updated,
   - any deviations from the spec with justification.

## NON-NEGOTIABLES

- Pages use ONLY DS components and tokens.
- Both light and dark themes look correct and pass contrast checks.
- Both iOS and MD modes render correctly.
- RTL works.
- All visible strings translated via i18n.
- Real D365 wiring stays behind `FF_PROJECT_ISSUANCE_USE_MOCK` until
  backend endpoints are confirmed by the backend team. Mock-first
  development is mandatory.
- No new third-party UI libraries introduced.
- Existing app tests remain green.
````

---

## Placeholders to fill in before sending

| Placeholder | Example |
|---|---|
| `[REFS_PATH]` | `docs/design-references` |
| `[INVENTORY_MODULE_PATH]` | `src/app/modules/inventory/` |
| `[USER_STORIES_DOC]` | `docs/User_Story_Project_Item_Issuance.docx` |
| `[BACKEND_PATTERN]` | `existing .NET BFF` / `direct OData` / `Sales API service` |

---

## Quick checklist before sending

- [ ] Design System PR is merged on your working branch.
- [ ] Reference HTML mockup at `[REFS_PATH]/Project_Issuance_Menu.html`.
- [ ] User stories DOCX at `[USER_STORIES_DOC]`.
- [ ] Master Project Prompt already sent in this Claude Code session.
- [ ] Branch created: `feature/project-issuance`.
- [ ] All `[BRACKETS]` replaced.

---

## What you get

- ✅ **4 pages + 2 modals** built entirely from DS components.
- ✅ **Mock-first** development behind `FF_PROJECT_ISSUANCE_USE_MOCK` — no backend dependency.
- ✅ **Two user stories** (US-PRJ-01 Picking List, US-PRJ-02 Ad-hoc Journal) implemented end-to-end.
- ✅ **Both themes** (light + dark) verified with the existing contrast test.
- ✅ **Both platform modes** (iOS + Material) snapshot-tested.
- ✅ **Full i18n coverage** (90+ keys pre-listed).
- ✅ **E2E happy path** test.
- ✅ **20 screenshots** before merge.

---

## Tips when running this prompt

- **Approve STEP 1 carefully.** The data shapes and the service surface are the foundation — everything else flows from them.
- **Insist on mock-first.** Don't let Claude wait on the backend team to deliver D365 custom services. The mobile work proves the UX; backend wiring is a follow-up PR.
- **Watch the action sheet routing.** The three actions all navigate to the same Issue page with different query params — easy to get the `postPackingSlip` flag wrong. Eyeball the navigation in the PLAN before approving.
- **Don't skip the success modal screenshots.** The summary row content differs between picking and ad-hoc; both versions must be captured in all 4 theme×mode combos.
- **Reject any DS deviation.** If Claude wants to inline a "small adjustment" because a DS component doesn't quite fit, the answer is to extend the DS in a follow-up — not to break the system.

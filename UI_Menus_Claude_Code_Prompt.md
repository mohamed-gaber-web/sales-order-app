# UI Menu Pages — Claude Code Prompt
## (AI Hub + Project Issuance, with Light & Dark Themes)

> **For:** Existing Angular + Ionic mobile app (warehouse / inventory module)
> **Stack:** Angular 16+, Ionic 7 or 8, Capacitor 5+
> **Prerequisite:** The **Design System** (DS) prompt has been executed first — tokens, Ionic palette overrides, and the wrapper component library exist under `src/app/shared/design-system/`.
> **Goal:** Build TWO real menu/page flows in the existing app — **AI Hub** and **Project Issuance** — using only DS components, fully working in **both Light and Dark themes**, on iOS and Android (Material) modes.

---

## How to use this file

1. Copy the static HTML reference mockups into the repo at `docs/design-references/`:
   - `AI_Hub_Menu_EN.html`
   - `Project_Issuance_Menu.html`
2. Make sure the **Design System** prompt (sent earlier) is already implemented on the branch — `src/app/shared/design-system/` exists with tokens, components and the style guide.
3. Open Claude Code in your project root.
4. Make sure the **Master Project Prompt** has been sent once this session.
5. Paste the prompt below as your next message.
6. Replace `[BRACKETS]` with real values before sending.

---

## What this prompt builds

### Page Flow A — AI Hub
A single page that catalogs **45 AI capabilities** in **10 domains**. The page has:
- Hero header with stats
- Sticky search
- Horizontally scrollable filter chips (technology tags)
- Expandable category cards
- Feature row taps → bottom-sheet modal with description, impact metrics, and tech stack

### Page Flow B — Project Issuance
A 4-page flow that lets the storekeeper:
- Browse open projects (with search + filter chips)
- Open a project → see its open item requirements
- Tap a requirement → choose action (Post Picking List / + Packing Slip / View Details) via a bottom action sheet
- Issue from requirement (Picking List form) OR Ad-hoc Item Journal (new item to project)
- Success modal after posting

Both flows must work end-to-end in **Light** and **Dark** themes and feel native on **iOS** and **Material (Android)**.

---

## The Prompt

````
Build TWO real menu/page flows in the app — AI Hub and Project Issuance —
using only the Design System we already built, in both light and dark
themes, on iOS and Material modes.

## CONTEXT

- App: Angular + Ionic + Capacitor (versions per the environment summary
  from the Design System work).
- DS is at `src/app/shared/design-system/` with all tokens + components +
  Ionic theme overrides already in place.
- Visual references (static HTML, NOT to be shipped):
    `[REFS_PATH]/AI_Hub_Menu_EN.html`
    `[REFS_PATH]/Project_Issuance_Menu.html`
- User stories that drive the Project Issuance flow:
    `[USER_STORIES_PROJECT_ISSUANCE]` (e.g.,
    `docs/User_Story_Project_Item_Issuance.docx`).
- Inventory module path: `[INVENTORY_MODULE_PATH]`
  (e.g., `src/app/modules/inventory/`).

CRITICAL CONSTRAINTS (NON-NEGOTIABLE):
- All visible UI uses ONLY Design System components and tokens.
- NO direct CSS color/size/radius/shadow literals in templates or
  component SCSS — tokens only.
- NO recreating Ionic primitives. Use the existing DS wrappers
  (ds-page, ds-toolbar, ds-hero, ds-search, ds-chip-row, ds-card,
  ds-list-row, ds-pill, ds-tag, ds-stat, ds-progress, ds-tabs,
  ds-form-field, ds-input, ds-qty-stepper, ds-scan-button,
  ds-toggle-row, ds-cta-bar, ds-button, ds-fab, ds-bottom-sheet,
  ds-success-state, ds-empty-state, ds-bottom-nav, ds-icon).
- Strings go through i18n. No hardcoded English. Place new keys under
  `inventory.aiHub.*` and `inventory.projectIssuance.*`.
- Both themes (light + dark) must look correct AND maintain WCAG AA
  contrast. Verify in the style guide AND in the actual pages.
- Both platform modes (iOS + Material) must render correctly.
- RTL-safe (Arabic) — use logical properties only.

## STEP 0 — VERIFY DS IS IN PLACE

Before doing anything page-related, list the existing DS components and
confirm all 25 are available. If any are missing, STOP and report which.
Do NOT build local stand-ins.

Also confirm both themes are working in the style guide:
- `/design-system/preview` → toggle theme → DS components recolor cleanly
  with no contrast violations.

If the style guide's theme toggle doesn't exist yet, build it as part
of this work (see STEP 4 below). Don't proceed to STEP 1 until light
and dark both look right in the style guide.

## STEP 1 — DATA & TYPES

Create the data layer for each flow under
`[INVENTORY_MODULE_PATH]/pages/`. Hardcoded for now (no backend wiring
in this PR — that's a follow-up).

### AI Hub data
File: `[INVENTORY_MODULE_PATH]/pages/ai-hub/ai-hub.data.ts`

```ts
export type AiTag = 'CV' | 'OCR' | 'NLP' | 'ML' | 'OPT' | 'DETECT' | 'AR';

export interface AiFeature {
  number: number;         // 1..45 across all categories
  title: string;
  description: string;
  tag: AiTag;
  impact: { speed: string; accuracy: string; time: string };
}

export interface AiCategory {
  id: string;             // 'recognition', 'quality', 'voice', ...
  icon: string;           // emoji
  title: string;
  subtitle: string;
  features: AiFeature[];
}

export const AI_HUB_DATA: AiCategory[];
```

Extract the 10 categories and 45 features verbatim from
`[REFS_PATH]/AI_Hub_Menu_EN.html`. Counts must equal:
5,5,5,5,5,4,5,4,4,3.

### Project Issuance data
File: `[INVENTORY_MODULE_PATH]/pages/project-issuance/project-issuance.data.ts`

```ts
export type ProjectStatus = 'InProcess' | 'Closed' | 'OnHold';
export type ReqStatus = 'Open' | 'Partial' | 'Closed';

export interface ProjectRequirement {
  id: string;
  itemNumber: string;
  product: string;
  category: string;
  requiredQty: number;
  remainingQty: number;
  uom: string;
  dueDate: string;        // ISO; format in UI
  status: ReqStatus;
}

export interface Project {
  id: string;             // e.g., MMG-000042
  name: string;
  customer: string;
  status: ProjectStatus;
  urgent: boolean;
  recent: boolean;
  openCount: number;
  partialCount: number;
  closedCount: number;
  requirements: ProjectRequirement[];
}

export const PROJECTS_DATA: Project[];
```

Extract the 5 projects + their requirements verbatim from
`[REFS_PATH]/Project_Issuance_Menu.html`.

WAIT FOR APPROVAL of the data shapes before continuing.

## STEP 2 — PAGE FLOW A: AI HUB

### Routing
- Path: `/inventory/ai-hub`
- Lazy-loaded if app uses NgModule routing; otherwise standalone route
  registered in the Inventory routes. MATCH the existing pattern.
- Feature flags: `FF_INVENTORY_MODULE` AND `FF_AI_HUB` (default true).
- Add an entry tile to `InventoryHomePage` linking to `/inventory/ai-hub`.

### Files
```
pages/ai-hub/
├── ai-hub.page.ts
├── ai-hub.page.html
├── ai-hub.page.scss
├── ai-hub.page.spec.ts
├── ai-hub.data.ts
├── ai-hub.types.ts                  (re-exports / mappings)
└── components/
    └── ai-feature-detail.modal.ts   (bottom-sheet content)
```

### Template structure (use only DS components)

```html
<ds-page>
  <ng-container header>
    <ds-toolbar [title]="'inventory.aiHub.toolbar.title' | translate"
                [showBack]="true"
                (back)="goBack()">
    </ds-toolbar>
  </ng-container>

  <ds-hero
    [badge]="{ text: 'inventory.aiHub.hero.badge' | translate, pulse: true }"
    [title]="'inventory.aiHub.hero.title' | translate"
    [accentWord]="'inventory.aiHub.hero.accentWord' | translate"
    [subtitle]="'inventory.aiHub.hero.subtitle' | translate"
    [stats]="heroStats()">
  </ds-hero>

  <div class="sticky-search">
    <ds-search
      [placeholder]="'inventory.aiHub.search.placeholder' | translate"
      [debounceMs]="150"
      (query)="onSearch($event)">
    </ds-search>

    <ds-chip-row
      [chips]="filterChips()"
      [multiSelect]="false"
      (change)="onFilter($event)">
    </ds-chip-row>
  </div>

  <ng-container *ngIf="visibleCategories().length; else empty">
    <ds-card *ngFor="let cat of visibleCategories(); trackBy: trackCat"
             variant="default"
             class="category">
      <div class="category-head" (click)="toggleCategory(cat.id)">
        <ds-icon [emoji]="cat.icon"></ds-icon>
        <div class="category-meta">
          <div class="title">{{ cat.title }}</div>
          <div class="subtitle">{{ cat.subtitle }}</div>
        </div>
        <ds-badge variant="accent" [text]="cat.features.length"></ds-badge>
        <ds-icon name="chevron-forward"
                 [class.rotated]="isOpen(cat.id)"></ds-icon>
      </div>

      <div class="features" *ngIf="isOpen(cat.id)">
        <ds-list-row *ngFor="let f of cat.features; trackBy: trackFeature"
                     [id]="padTwo(f.number)"
                     [title]="f.title"
                     [meta]="f.description"
                     (activate)="openDetail(cat, f)">
          <ds-tag [tag]="f.tag" slot="trailing"></ds-tag>
        </ds-list-row>
      </div>
    </ds-card>
  </ng-container>

  <ng-template #empty>
    <ds-empty-state
      icon="search"
      [message]="'inventory.aiHub.empty.message' | translate"
      [hint]="'inventory.aiHub.empty.hint' | translate">
    </ds-empty-state>
  </ng-template>
</ds-page>

<ds-bottom-sheet
  [open]="!!selectedFeature()"
  (close)="closeDetail()">
  <ai-feature-detail-modal
    [category]="selectedCategory()"
    [feature]="selectedFeature()"
    (close)="closeDetail()"
    (request)="onRequestFeature($event)">
  </ai-feature-detail-modal>
</ds-bottom-sheet>
```

### State (Angular signals)
- `searchQuery = signal('')`
- `activeFilter = signal<AiTag | 'all'>('all')`
- `openCategoryIds = signal<Set<string>>(new Set(['recognition']))`
- `selectedFeature = signal<AiFeature | null>(null)`
- `selectedCategory = signal<AiCategory | null>(null)`
- `visibleCategories = computed(...)` — filtered by query + tag
- `heroStats = computed(() => [...])` — features visible / domains / 'D365'

### Interactions
- Search auto-opens any category that still has matches.
- Selecting a filter chip narrows visible features.
- Tap a feature row → opens `ds-bottom-sheet` with title, description,
  3 impact pills (Speed / Accuracy / Time), Tech Stack (tag short +
  long name).
- "Request feature" button in modal → shows a toast
  (`inventory.aiHub.detail.requested` translation key).
- Empty state when zero matches.

### Theme behavior
- Verify ALL text remains readable in both themes.
- Tag chip colors use accent token + soft background — same hue in
  light and dark; ensure the `-soft` variant produces enough contrast
  in light mode (it may need a darker soft variant — if so, add light
  overrides in the DS tokens, do NOT hardcode per-page).

## STEP 3 — PAGE FLOW B: PROJECT ISSUANCE

Mirrors the user stories in `[USER_STORIES_PROJECT_ISSUANCE]`. Build
four pages and the supporting modals.

### Routing
- Path: `/inventory/project-issuance`
- Children:
    - `''` → ProjectListPage
    - `':projectId'` → ProjectDetailPage
    - `':projectId/issue/:requirementId'` → IssueFromRequirementPage
    - `'adhoc'` → AdhocIssuancePage (FAB entry)
    - `':projectId/adhoc'` → AdhocIssuancePage (in-project entry)
- Feature flag: `FF_PROJECT_ISSUANCE` (default true).
- Add a tile on `InventoryHomePage` linking to the root.

### Files
```
pages/project-issuance/
├── project-issuance-routing.module.ts (or routes file if standalone)
├── project-issuance.data.ts
├── project-issuance.types.ts
├── project-issuance.state.ts          (shared state: signals/store)
├── project-list/
│   ├── project-list.page.ts
│   ├── project-list.page.html
│   └── project-list.page.scss
├── project-detail/
│   ├── project-detail.page.ts
│   ├── project-detail.page.html
│   └── project-detail.page.scss
├── issue-from-requirement/
│   ├── issue-from-requirement.page.ts
│   ├── issue-from-requirement.page.html
│   └── issue-from-requirement.page.scss
├── adhoc-issuance/
│   ├── adhoc-issuance.page.ts
│   ├── adhoc-issuance.page.html
│   └── adhoc-issuance.page.scss
└── components/
    ├── requirement-action-sheet.component.ts
    └── post-success.modal.ts
```

### Page A — Project List

```html
<ds-page>
  <ng-container header>
    <ds-toolbar [title]="'inventory.projectIssuance.list.title' | translate"
                [showBack]="true">
    </ds-toolbar>
  </ng-container>

  <ds-hero
    [badge]="{ text: 'inventory.projectIssuance.list.badge' | translate, pulse: true }"
    [title]="'inventory.projectIssuance.list.heading' | translate"
    [accentWord]="'inventory.projectIssuance.list.accentWord' | translate"
    [subtitle]="'inventory.projectIssuance.list.subtitle' | translate"
    [stats]="stats()">
  </ds-hero>

  <ds-search [placeholder]="'inventory.projectIssuance.list.searchPh' | translate"
             (query)="onSearch($event)">
  </ds-search>

  <ds-chip-row [chips]="filterChips()" (change)="onFilter($event)">
  </ds-chip-row>

  <ds-list-row *ngFor="let p of visibleProjects(); trackBy: trackProject"
               [icon]="p.urgent ? 'flame' : 'apps'"
               [id]="p.id"
               [title]="p.name"
               [meta]="metaFor(p)"
               (activate)="openProject(p)">
    <ds-pill *ngIf="p.urgent" slot="trailing" variant="warning"
             [text]="'inventory.projectIssuance.list.pill.urgent' | translate"></ds-pill>
    <ds-pill *ngIf="!p.urgent" slot="trailing" variant="open"
             [text]="'inventory.projectIssuance.list.pill.inProcess' | translate"></ds-pill>
  </ds-list-row>

  <ds-fab icon="add"
          [tooltip]="'inventory.projectIssuance.list.fabTooltip' | translate"
          (action)="goAdhoc()">
  </ds-fab>
</ds-page>
```

### Page B — Project Detail

Header uses `ds-toolbar` with eyebrow="PROJECT" and the project name.
Below: a project header block (id + status pill + name + customer +
3 pstats Open/Partial/Closed). Then `ds-tabs` (Requirements / History /
Info), then a list of `ds-card` per requirement showing item code,
product, required, remaining, due date, progress bar (`ds-progress`).

Bottom sticky CTA bar uses `ds-cta-bar` with Back + "+ Ad-hoc Item".

Tapping a requirement opens a `ds-bottom-sheet` with three actions:
- Post Picking List
- Post Picking List + Packing Slip
- View Details

All three navigate to `IssueFromRequirementPage` with appropriate
query params (e.g., `?postPackingSlip=true`).

### Page C — Issue from Requirement

Form built entirely from `ds-form-field` + `ds-input` + `ds-qty-stepper`
+ `ds-scan-button` + `ds-toggle-row`. Cards:
1. Item Information (read-only product, item number, category).
2. Quantity to Issue (qty stepper, helper showing
   "Remaining: X, On-hand: Y").
3. Inventory Dimensions (site, warehouse, location, batch) + Scan
   Barcode button.
4. Posting Options (Post Packing Slip toggle + Print Label toggle).

Sticky `ds-cta-bar` with Cancel + POST. POST opens `ds-bottom-sheet`
containing the `post-success.modal` with summary rows (Project, Item,
Quantity, Picking List status, Packing Slip status, Journal #).

### Page D — Ad-hoc Issuance

Same building blocks; cards:
1. Target Project (prefilled if coming from project detail; editable if
   coming from FAB on list).
2. Item Number + Scan barcode.
3. Quantity + UoM.
4. Inventory Dimensions.
5. Project Dimensions (Category, Activity, Line Property — defaults
   from project setup).

POST → success modal → back to project detail.

### State
A small `project-issuance.state.ts` exports signals + helpers:
- `currentProject`, `currentRequirement`, `searchQuery`, `activeFilter`,
- `setCurrentProject(id)`, `setCurrentRequirement(id)`, `clearSelection()`.
Used across the 4 pages.

## STEP 4 — THEME SWITCHING (LIGHT / DARK)

Add a `ThemeService` and a toggle UI. Implementation depends on Ionic
version (use what was set up in the DS phase):

### Service
File: `src/app/shared/design-system/services/theme.service.ts`

```ts
export type ThemePreference = 'system' | 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'ds_theme';
  readonly preference = signal<ThemePreference>('system');
  readonly resolvedTheme = signal<'light' | 'dark'>('light');

  async init(): Promise<void> { /* read from Ionic Storage, apply */ }
  async set(pref: ThemePreference): Promise<void> { /* apply + persist + sync native */ }
  private apply(pref: ThemePreference): void {
    const root = document.documentElement;
    // Strategy depends on Ionic version detected in the DS phase:
    // v8 + class palette:
    //   - 'light' → root.classList.remove('ion-palette-dark')
    //   - 'dark'  → root.classList.add('ion-palette-dark')
    //   - 'system' → follow matchMedia('(prefers-color-scheme: dark)')
    // v7 (no palette files):
    //   - 'light' → body.classList.remove('dark')
    //   - 'dark'  → body.classList.add('dark')
    //   - 'system' → matchMedia listener toggles class
  }
}
```

### Native status bar sync
When the resolved theme changes, call `@capacitor/status-bar`:
- `setStyle({ style: Style.Dark })` when resolved = dark
- `setStyle({ style: Style.Light })` when resolved = light
- Set `setBackgroundColor` to `--ds-bg-0` for Android.

Install `@capacitor/status-bar` if not already present and document
the installation in the PR.

### Toggle UI
A new component `ds-theme-switcher` (lives in
`src/app/shared/design-system/components/theme-switcher/`):

- Uses `ion-segment` with three buttons: System / Light / Dark.
- Bound to `ThemeService.preference()`.
- Place this component:
    a. on the style guide page (`/design-system/preview`),
    b. on a future Settings/Profile page (out of scope here — just leave
       a code-comment TODO).

### Light theme tokens
If not already complete from the DS phase, finalize light-theme values
in `src/theme/variables.scss` (or the relevant palette file). Mirror
every dark token. Light-theme starting point (you may tune to match
the references):

```scss
:root {
  /* Light surfaces */
  --ds-bg-0: #fafbfc;
  --ds-bg-1: #ffffff;
  --ds-bg-2: #f1f5f9;
  --ds-bg-3: #e2e8f0;
  --ds-line: #cbd5e1;
  --ds-line-soft: #e2e8f0;

  /* Light text */
  --ds-txt-0: #0f172a;
  --ds-txt-1: #1e293b;
  --ds-txt-2: #475569;
  --ds-txt-3: #94a3b8;

  /* Accents — same hue, slightly tuned for AA on white */
  --ds-accent:        #84cc16;  /* lime tuned for light bg */
  --ds-accent-soft:   rgba(132, 204, 22, 0.12);
  --ds-info:          #0284c7;
  --ds-info-soft:     rgba(2, 132, 199, 0.10);
  --ds-warning:       #d97706;
  --ds-warning-soft:  rgba(217, 119, 6, 0.10);
  --ds-danger:        #dc2626;
  --ds-danger-soft:   rgba(220, 38, 38, 0.10);
  --ds-success:       #16a34a;
  --ds-success-soft:  rgba(22, 163, 74, 0.10);
  --ds-attention:     #db2777;
  --ds-attention-soft:rgba(219, 39, 119, 0.10);
  --ds-special:       #7c3aed;
  --ds-special-soft:  rgba(124, 58, 237, 0.10);
}
```

Then under the dark palette selector (`.ion-palette-dark` for v8 or
`@media (prefers-color-scheme: dark)` for v7), override every token
back to the dark values defined in the DS.

VERIFY each accent in light mode has **≥ 4.5:1** contrast on
`--ds-bg-0`/`--ds-bg-1` for body text and **≥ 3:1** for large text and
non-text UI. If any fail, tune the hue or use a dedicated "light" set
of accents — do NOT lower contrast.

### Contrast verification
Add a test (`theme.contrast.spec.ts`) that:
1. Loads the style guide,
2. For each accent token, computes contrast vs `--ds-bg-0` and `--ds-bg-1`,
3. Asserts WCAG AA thresholds.

Use a small inline contrast util (no new npm dependency unless one is
already in the project).

## STEP 5 — i18n KEYS

Add new keys under the existing translation framework:

```
inventory.aiHub.toolbar.title
inventory.aiHub.hero.badge
inventory.aiHub.hero.title
inventory.aiHub.hero.accentWord
inventory.aiHub.hero.subtitle
inventory.aiHub.search.placeholder
inventory.aiHub.filters.all
inventory.aiHub.filters.vision
inventory.aiHub.filters.ocr
inventory.aiHub.filters.nlp
inventory.aiHub.filters.ml
inventory.aiHub.filters.opt
inventory.aiHub.filters.detect
inventory.aiHub.filters.ar
inventory.aiHub.empty.message
inventory.aiHub.empty.hint
inventory.aiHub.detail.title
inventory.aiHub.detail.whatItDoes
inventory.aiHub.detail.expectedImpact
inventory.aiHub.detail.techStack
inventory.aiHub.detail.metric.speed
inventory.aiHub.detail.metric.accuracy
inventory.aiHub.detail.metric.time
inventory.aiHub.detail.requestFeature
inventory.aiHub.detail.requested

inventory.projectIssuance.list.title
inventory.projectIssuance.list.heading
inventory.projectIssuance.list.accentWord
inventory.projectIssuance.list.subtitle
inventory.projectIssuance.list.badge
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

inventory.projectIssuance.detail.tabs.requirements
inventory.projectIssuance.detail.tabs.history
inventory.projectIssuance.detail.tabs.info
inventory.projectIssuance.detail.stats.open
inventory.projectIssuance.detail.stats.partial
inventory.projectIssuance.detail.stats.closed
inventory.projectIssuance.detail.cta.adhoc

inventory.projectIssuance.actionSheet.title
inventory.projectIssuance.actionSheet.postPicking
inventory.projectIssuance.actionSheet.postPickingAndPacking
inventory.projectIssuance.actionSheet.viewDetails

inventory.projectIssuance.issue.toolbar.eyebrow
inventory.projectIssuance.issue.toolbar.title
inventory.projectIssuance.issue.cards.item
inventory.projectIssuance.issue.cards.qty
inventory.projectIssuance.issue.cards.dims
inventory.projectIssuance.issue.cards.options
inventory.projectIssuance.issue.helper.remaining
inventory.projectIssuance.issue.helper.onHand
inventory.projectIssuance.issue.toggle.packingSlip
inventory.projectIssuance.issue.toggle.printLabel
inventory.projectIssuance.issue.cta.cancel
inventory.projectIssuance.issue.cta.post

inventory.projectIssuance.adhoc.toolbar.eyebrow
inventory.projectIssuance.adhoc.toolbar.title
inventory.projectIssuance.adhoc.cards.project
inventory.projectIssuance.adhoc.cards.item
inventory.projectIssuance.adhoc.cards.qty
inventory.projectIssuance.adhoc.cards.dims
inventory.projectIssuance.adhoc.cards.projectDims
inventory.projectIssuance.adhoc.cta.post

inventory.projectIssuance.success.picking.title
inventory.projectIssuance.success.picking.message
inventory.projectIssuance.success.adhoc.title
inventory.projectIssuance.success.adhoc.message
inventory.projectIssuance.success.cta.done
inventory.projectIssuance.success.cta.viewProject
```

Populate **English** translations from the references. Add the SAME
keys with `__TODO__` values to the secondary language file if the app
already supports more than English; flag this in the PR so a
translator can fill them.

## STEP 6 — INVENTORY HOME WIRING

Add two tiles on `InventoryHomePage`:
- "AI Hub" → `/inventory/ai-hub` (gated by `FF_AI_HUB`).
- "Project Issuance" → `/inventory/project-issuance` (gated by
  `FF_PROJECT_ISSUANCE`).

Reuse the same tile pattern already used by other transactions; pass
DS icons.

## STEP 7 — TESTING

For EACH page, at least:
- Renders without errors in both light and dark themes.
- Search reduces visible items.
- Filter chip narrows visible items.
- Empty state shows when nothing matches.
- Tapping a row navigates or opens the right modal.
- POST flows show the success modal with correct summary content.
- Back navigation works.

Component tests use Angular's TestBed with Ionic's `IonicModule.forRoot()`
and force mode for snapshots:
- `Config.set({ mode: 'ios' })` for one test run,
- `Config.set({ mode: 'md' })` for another.

Snapshot test the AI Hub page and the Project List page in each
mode × theme combination (ios+light, ios+dark, md+light, md+dark).

Add an e2e (Cypress or Playwright, whatever the project uses) test that
walks the project issuance flow end-to-end from
`/inventory/project-issuance` → list → detail → action sheet → post →
success → back.

## STEP 8 — VERIFICATION

Run and report:
- `npm run lint`
- `npm run typecheck`
- `npm test` (filter to inventory)
- `ionic build --prod` — succeeds, no warnings about unknown CSS vars
  or deprecated APIs.
- Capacitor:
    - `npx cap sync android && npx cap open android`
    - `npx cap sync ios && npx cap open ios`
- Visual: open each page and capture screenshots in
    ios + light,
    ios + dark,
    md + light,
    md + dark.
  Attach all 16 (4 pages × 4 combos) to the PR. (AI Hub = 1 page,
  Project Issuance = 4 pages → 5 × 4 = 20 screenshots.)
- Contrast test (`theme.contrast.spec.ts`) passes.
- Hardcoded-value sweep — run the script from the DS PR. ZERO matches
  inside the two new page folders.

## DO BEFORE WRITING CODE

1. Confirm DS readiness (STEP 0). If anything is missing, STOP and
   report.
2. Confirm data extraction (STEP 1). Report the 10 categories / 45
   features and the 5 projects / their requirements you'll use. WAIT
   FOR APPROVAL.
3. Submit the full PLAN:
   - files to add per page,
   - the routing additions,
   - the i18n key set,
   - the InventoryHome tile additions,
   - estimated commits.
4. WAIT for approval.
5. After approval, implement in this order, committing per step:
   a. Data + types (Step 1)
   b. Theme service + light tokens + dark palette + native status bar
      (Step 4)
   c. i18n keys (Step 5)
   d. AI Hub page (Step 2) + tests
   e. Project Issuance pages (Step 3) + tests, in order:
      list → detail → action sheet → issue-from-requirement → adhoc →
      success modal
   f. InventoryHome tiles (Step 6)
   g. Style guide additions (theme switcher gallery)
   h. Final verification (Step 8) + hardcoded-value sweep

## OUTPUT EXPECTED

1. STEP 0 report (DS readiness).
2. STEP 1 data confirmation (categories + projects).
3. The PLAN.
4. Per-step commits with conventional-commit messages
   (`feat(ai-hub): list + filters page`,
   `feat(project-issuance): project list page`,
   `feat(ds): theme switcher component`, etc.).
5. After each step: lint + tests + build results.
6. Final PR with:
   - all 24 screenshots,
   - contrast test results,
   - hardcoded-value sweep results,
   - i18n key list + which language files were updated,
   - any deviations from the spec with justification.

## NON-NEGOTIABLES

- Pages use ONLY DS components and tokens — no exceptions.
- Both light and dark themes meet WCAG AA on every accent.
- Both iOS and Material modes render correctly.
- RTL works (test by setting `dir="rtl"` on the page wrapper).
- All visible strings are translated via i18n.
- Native status bar follows the active theme on real devices.
- Existing tests stay green.
- No new third-party UI libraries introduced.
````

---

## Placeholders to fill in before sending

| Placeholder | Example |
|---|---|
| `[REFS_PATH]` | `docs/design-references` |
| `[INVENTORY_MODULE_PATH]` | `src/app/modules/inventory/` |
| `[USER_STORIES_PROJECT_ISSUANCE]` | `docs/User_Story_Project_Item_Issuance.docx` |

---

## Quick checklist before sending

- [ ] Design System prompt already executed and merged on this branch.
- [ ] Reference HTML files copied to `[REFS_PATH]`.
- [ ] User Stories DOCX placed in the repo at the path above.
- [ ] Master Project Prompt already sent in this Claude Code session.
- [ ] Branch created: `feature/inventory-menus`.
- [ ] All `[BRACKETS]` replaced.

---

## How this prompt guarantees light & dark theme correctness

| Concern | Handled by |
|---|---|
| **Both themes render** | Light tokens defined alongside dark; toggled via Ionic palette class (v8) or `prefers-color-scheme` (v7). |
| **No hardcoded colors leak in** | Hardcoded-value sweep is a verification step — zero allowed in the new folders. |
| **Accent contrast** | A real automated `theme.contrast.spec.ts` test runs WCAG AA assertions for every accent against both background tokens. |
| **Theme switcher** | A `ds-theme-switcher` component (System / Light / Dark) is added to the style guide AND a `ThemeService` is wired in. |
| **Native status bar** | `@capacitor/status-bar` `setStyle` / `setBackgroundColor` called whenever the resolved theme changes. |
| **iOS vs Material** | Snapshot tests cover both modes × both themes (4 combos per page). |
| **RTL** | Logical properties only; verified by toggling `dir="rtl"` on a sandbox in the style guide. |
| **Persistence** | Theme preference persisted in Ionic Storage so it survives app restarts. |
| **System mode** | `matchMedia('(prefers-color-scheme: dark)')` listener keeps things in sync when the user changes their OS theme. |
| **Accessibility** | WCAG AA contrast enforced automatically; min 48×48 touch targets inherited from DS components. |

---

## Tips when running this prompt

- **Approve the data extraction** in STEP 1 before any code — it's the
  cheapest place to fix typos and wrong impact metrics.
- **Watch for soft-color contrast traps in light mode.** Neon green
  `#c6ff3d` on white is unreadable. The prompt addresses this by
  defining separate light-mode accent values — verify the contrast
  test passes before merging.
- **Force snapshot tests in 4 combos.** It's tempting to skip MD + light
  if iOS + dark looks fine — don't.
- **Native status bar matters** — when previewing on the desktop
  browser, the status bar is just CSS. On a real device it's a system
  thing that needs the Capacitor plugin to follow your theme. Test on
  device.
- **Reject scope creep.** This PR is two flows + theme switcher. Real
  D365 wiring, label printing, scanner integration → follow-ups.

# Mobile App Design System — Claude Code Prompt
## (Ionic-Native, Mobile-First)

> **For:** Existing Angular + Ionic mobile app (warehouse / inventory module)
> **Stack target:** Angular 16+, Ionic 7 or 8, Capacitor 5+
> **Goal:** Add a consistent **Design System** that is 100% compatible with Ionic — built on top of Ionic primitives, Ionic's CSS Variables, CSS Shadow Parts, and Ionic's theming/palette system. The DS extends Ionic, it does not fight it.
> **Output:** A reusable design system (tokens + components + utilities) that all current and future pages must use.

---

## How to use this file

1. Copy reference HTML mockups into your repo at `docs/design-references/`:
   - `AI_Hub_Menu_EN.html`
   - `Project_Issuance_Menu.html`
2. Open Claude Code in your project root.
3. Make sure the Master Project Prompt has been sent once in this session.
4. Paste the prompt below as your next message.
5. Replace anything in `[BRACKETS]` with real values before sending.

---

## Why this version is different from a generic web design system

Ionic ships with its own opinionated rules. Ignoring them creates fragile, hard-to-maintain UIs. This prompt enforces:

- **Use `ion-*` primitives** (ion-content, ion-header, ion-toolbar, ion-button, ion-list, ion-item, ion-input, ion-modal, ion-fab, ion-segment, ion-chip, ion-badge, ion-card, ion-skeleton-text, ion-refresher, ion-infinite-scroll) — DO NOT recreate them.
- **Customize Ionic only via supported channels**: CSS Custom Properties (the `--ion-*` and component-level `--name` variables) and CSS Shadow Parts (`::part(native)`). NO deep selectors like `ion-button > button`.
- **Theme via Ionic palette files** (`@ionic/angular/css/palettes/dark.system.css` for v8, or `@media (prefers-color-scheme: dark)` for v7) — not bespoke dark mode wiring.
- **Respect platform modes** (`ios` vs `md`) — Ionic auto-applies these and our DS must look correct in both.
- **Safe area insets** via Ionic's built-in handling (status bar / home indicator) — don't reinvent.
- **RTL** support comes for free from Ionic — DS must not break it (use logical properties, no hardcoded left/right margins).
- **No `!important`** unless absolutely necessary; if it is, document why.

---

## The Prompt

````
Build the Design System for our Angular + Ionic mobile app — fully
Ionic-native and mobile-first.

## CONTEXT

We have several mobile UI mockups that define our visual language:
- `[REFS_PATH]/AI_Hub_Menu_EN.html` — feature catalog with hero, search,
  chips, expandable categories, bottom-sheet modal.
- `[REFS_PATH]/Project_Issuance_Menu.html` — multi-step flow with list,
  detail, form, success state, action sheet, FAB.

Extract the visual language from these references and turn it into a
formal Design System integrated into the existing Angular + Ionic app.

CRITICAL CONSTRAINTS (NON-NEGOTIABLE):
- We are NOT replacing Ionic. The DS extends Ionic.
- Every DS component is built ON TOP of Ionic primitives where one
  exists. Don't recreate a button, item, input, modal, fab, chip, or
  segment from scratch — wrap or theme the Ionic one.
- Customization channels (in order of preference):
    1) Ionic CSS Variables (--ion-* globals and component-level --vars),
    2) CSS Shadow Parts (::part(native), ::part(placeholder), etc.),
    3) Wrapper Angular components that COMPOSE ion-* primitives,
    4) Last resort: scoped class names + Shadow DOM-safe CSS.
- NO deep selectors into ion-* components (e.g. `ion-button > button`).
  They break on Ionic upgrades.
- NO `!important` unless documented with a justification comment.

## DELIVERABLES

1. Design **tokens** (SCSS) extracted from the references.
2. **Ionic theme overrides** in `src/theme/variables.scss` and the
   palette files in `src/theme/palettes/`.
3. **Wrapper component library** under `src/app/shared/design-system/`
   that composes Ionic primitives + applies DS tokens.
4. **Refactor ONE existing page** to use the DS end-to-end.
5. A **style guide page** at `/design-system/preview` listing tokens and
   live component examples.
6. **Docs**: `src/app/shared/design-system/README.md`.

## STEP 0 — INSPECT THE EXISTING APP

Before extracting anything, READ and report back:

- `package.json` → exact Ionic version (`@ionic/angular`) and Angular
  version. Note Capacitor plugins installed.
- `src/theme/variables.scss` → list every override already present.
- `angular.json` → confirm `src/global.scss`, `src/theme/variables.scss`,
  and `@ionic/angular/css/*.css` imports are wired.
- `src/global.scss` → which Ionic CSS utility files are imported (core,
  normalize, structure, typography, display, padding, flex-utils, etc.).
- Existing pages — list which `ion-*` primitives they use most.
- Existing fonts — what's already in `--ion-font-family`.

Output a short "ENVIRONMENT" summary. If Ionic version is v8+, use the
palette-file approach for dark mode. If v7, use the `@media
(prefers-color-scheme: dark)` approach. Adapt the rest of the plan
accordingly. DO NOT proceed past this step without confirming with me.

## STEP 1 — EXTRACT TOKENS

Open the reference HTML files and extract:
- Custom properties under `:root`.
- Typography (families, sizes, weights, line heights).
- Spacing scale (4 / 8 / 12 / 14 / 16 / 18 / 20 / 24 / 28 / 36 px).
- Radii scale.
- Shadows.
- Animation durations and easing curves.

Produce `src/app/shared/design-system/tokens.md` listing every token
with its value and where it appears in the references. WAIT FOR APPROVAL
before writing SCSS.

## STEP 2 — TOKENS FILE

Create `src/app/shared/design-system/_tokens.scss`. Use these EXACT
token names. They live as CSS custom properties so Ionic and the DS
share the same source of truth.

### Surfaces and lines
```scss
--ds-bg-0: #07090c;
--ds-bg-1: #0d1117;
--ds-bg-2: #131a23;
--ds-bg-3: #1a2330;
--ds-line: #1f2a37;
--ds-line-soft: #18222e;
```

### Text
```scss
--ds-txt-0: #f1f5f9;
--ds-txt-1: #cbd5e1;
--ds-txt-2: #94a3b8;
--ds-txt-3: #64748b;
```

### Semantic accents (with -soft variants for backgrounds)
```scss
--ds-accent:        #c6ff3d; --ds-accent-soft:    rgba(198,255,61,0.12);
--ds-info:          #00d9ff; --ds-info-soft:      rgba(0,217,255,0.10);
--ds-warning:       #ffb547; --ds-warning-soft:   rgba(255,181,71,0.10);
--ds-danger:        #ef4444; --ds-danger-soft:    rgba(239,68,68,0.10);
--ds-success:       #22c55e; --ds-success-soft:   rgba(34,197,94,0.10);
--ds-attention:     #ff4d8d; --ds-attention-soft: rgba(255,77,141,0.10);
--ds-special:       #a855f7; --ds-special-soft:   rgba(168,85,247,0.10);
```

### Typography
```scss
--ds-font-sans: 'Plus Jakarta Sans', var(--ion-font-family, system-ui), sans-serif;
--ds-font-display: 'Fraunces', var(--ds-font-sans);
--ds-font-mono: 'JetBrains Mono', ui-monospace, monospace;

--ds-text-xs: 10px;
--ds-text-sm: 11px;
--ds-text-base: 13px;
--ds-text-md: 14px;
--ds-text-lg: 15px;
--ds-text-xl: 18px;
--ds-text-h3: 20px;
--ds-text-h2: 24px;
--ds-text-h1: 28px;
--ds-text-display: 36px;

--ds-weight-regular: 400;
--ds-weight-medium: 500;
--ds-weight-semibold: 600;
--ds-weight-bold: 700;
--ds-weight-black: 800;

--ds-lh-tight: 1.15;
--ds-lh-snug: 1.3;
--ds-lh-normal: 1.5;
```

USAGE RULES:
- mono → stat numbers, IDs (project ID, item number, journal #), tags,
  pills, technical eyebrows.
- display → large hero h1 and modal hero titles only.
- sans → everything else.

### Spacing, radii, shadows, motion
Use the values listed in the references. Group them under:
`--ds-space-1..10`, `--ds-radius-xs..3xl + pill + modal + canvas`,
`--ds-shadow-sm/md/lg/glow`, `--ds-motion-fast/base/slow/modal` and
`--ds-ease-out/in-out/snap`.

Wrap everything in `:root` so Ionic and our components inherit.

## STEP 3 — IONIC PALETTE INTEGRATION

This is the heart of compatibility. Edit `src/theme/variables.scss` to
**map DS tokens onto Ionic's variables**. The DS becomes the source of
truth; Ionic primitives inherit our look.

```scss
@import '../app/shared/design-system/tokens';

:root {
  /* Ionic semantic colors → DS accents */
  --ion-color-primary: var(--ds-accent);
  --ion-color-primary-rgb: 198, 255, 61;
  --ion-color-primary-contrast: var(--ds-bg-0);
  --ion-color-primary-contrast-rgb: 7, 9, 12;
  --ion-color-primary-shade: #b3e600;
  --ion-color-primary-tint: #d4ff5e;

  --ion-color-secondary: var(--ds-info);
  --ion-color-secondary-rgb: 0, 217, 255;
  --ion-color-secondary-contrast: var(--ds-bg-0);
  --ion-color-secondary-contrast-rgb: 7, 9, 12;
  --ion-color-secondary-shade: #00c2e6;
  --ion-color-secondary-tint: #1ddeff;

  --ion-color-success: var(--ds-success);
  --ion-color-success-rgb: 34, 197, 94;
  /* ...same pattern for warning/danger/tertiary/medium/light/dark */

  /* App-level surfaces and text */
  --ion-background-color: var(--ds-bg-0);
  --ion-background-color-rgb: 7, 9, 12;
  --ion-text-color: var(--ds-txt-0);
  --ion-text-color-rgb: 241, 245, 249;

  /* Toolbar / Header */
  --ion-toolbar-background: var(--ds-bg-1);
  --ion-toolbar-color: var(--ds-txt-0);
  --ion-toolbar-border-color: var(--ds-line-soft);

  /* Items / Lists */
  --ion-item-background: var(--ds-bg-2);
  --ion-item-color: var(--ds-txt-0);
  --ion-item-border-color: var(--ds-line-soft);

  /* Card */
  --ion-card-background: var(--ds-bg-2);
  --ion-card-color: var(--ds-txt-0);

  /* Stepped colors for elevation */
  --ion-color-step-50:  #0a0d12;
  --ion-color-step-100: #0d1117;
  --ion-color-step-150: #131a23;
  --ion-color-step-200: #1a2330;
  /* ...continue through step-1000 */

  /* Typography */
  --ion-font-family: var(--ds-font-sans);
}
```

You MUST generate the full primary/secondary/tertiary/success/warning/
danger/medium/light/dark sets using Ionic's official **Color Generator**
output format (base, base-rgb, contrast, contrast-rgb, shade, tint). Do
not skip any of these — Ionic's button/badge/chip color attributes rely
on them.

Provide the full stepped color palette (--ion-color-step-50 through
--ion-color-step-1000) for both light and dark.

### Dark mode strategy
Detect Ionic version:
- **Ionic 8+**: import `@ionic/angular/css/palettes/dark.system.css`
  in `src/global.scss` for system-driven dark mode AND keep our DS
  overrides AFTER that import so we win. Optionally also import
  `dark.always.css` if the app should always be dark.
- **Ionic 7**: use `@media (prefers-color-scheme: dark) { :root { ... } }`
  inside `src/theme/variables.scss` with the same token mappings.

For class-based manual toggle, also create
`@import '@ionic/angular/css/palettes/dark.class.css'` (v8) or wrap
overrides in `body.dark { ... }` (v7), exposed via a `ThemeService` that
sets/removes the class on `<body>` and persists in `@ionic/storage`.

### Platform modes
Do not target `.ios` or `.md` to override the dark palette — those
classes are component-level and beat root variables. If a token needs
to differ by platform, do it on the component (`:host-context(.ios)`
inside the wrapper component, not globally).

## STEP 4 — TYPOGRAPHY

In `src/global.scss`:
1. Import the web fonts (Plus Jakarta Sans, Fraunces, JetBrains Mono).
   Self-host under `src/assets/fonts/` using `@font-face` for offline
   reliability on mobile.
2. Apply `font-family: var(--ds-font-sans)` to `body`.
3. Set utility classes `.ds-display`, `.ds-mono` for ad-hoc usage in
   templates.
4. DO NOT remove Ionic's `@ionic/angular/css/typography.css` — it sets
   sensible defaults for ion-text and headings; we only override
   `--ion-font-family`.

## STEP 5 — WRAPPER COMPONENT LIBRARY

Create components under `src/app/shared/design-system/components/`.
Follow the existing app's pattern (NgModule vs standalone — match it).

EACH component rule:
- Composes `ion-*` primitives where possible; only adds wrapper styling.
- Uses `ChangeDetectionStrategy.OnPush`.
- Uses `ViewEncapsulation.Emulated` (default Angular — keeps styles
  scoped without Shadow DOM, lets `::part()` and `--ion-*` variables
  still reach Ionic primitives inside).
- Public API: typed `@Input()` / `@Output()`, no `any`.
- Styles use ONLY DS tokens.
- A11y: labels, roles, focus visible, min 48×48 touch target.
- i18n: takes strings via inputs; never hardcoded English.
- RTL-safe: logical properties only (`margin-inline-start`, not
  `margin-left`).

### Required components (v1) — ALL built on Ionic primitives

1. **`ds-page`**
   Wraps `ion-content`. Slots: `[header]`, default, `[footer]`.
   Provides safe-area padding and DS background. Auto-applies
   `[fullscreen]` to ion-content.

2. **`ds-toolbar`** (uses `ion-header` + `ion-toolbar`)
   Inputs: `eyebrow`, `title`, `showBack`, `rightIcon`.
   Slots: optional `[end]` for custom buttons.
   Outputs: `(back)`, `(rightAction)`.
   Themes the ion-toolbar via shadow parts:
   ```scss
   ion-toolbar::part(container) { padding-inline: var(--ds-space-5); }
   ```

3. **`ds-hero`**
   Custom block (no direct Ionic primitive equivalent).
   Inputs: `badge`, `title`, `accentWord`, `subtitle`, `stats[]`.
   The stat cards inside use `ion-card` styled via `--background`.

4. **`ds-search`** (wraps `ion-searchbar`)
   Theme via:
   ```scss
   ion-searchbar {
     --background: var(--ds-bg-2);
     --color: var(--ds-txt-0);
     --placeholder-color: var(--ds-txt-3);
     --border-radius: var(--ds-radius-xl);
     --box-shadow: none;
   }
   ```
   Inputs: `placeholder`, `debounceMs` (default 150).
   Output: `(query)` debounced.

5. **`ds-chip-row`** (wraps `ion-segment` OR a horizontal `ion-chip` row)
   Prefer `ion-segment` with `scrollable` for single-select filters.
   For multi-select, use `ion-chip` array with `outline`/`color` props.
   Inputs: `chips: { id, label, count?, active }[]`, `multiSelect`.
   Output: `(change)`.
   Themes ion-segment-button via `::part(native)` for the active state
   to match the neon background from references.

6. **`ds-card`** (wraps `ion-card`)
   Variants: `default`, `inset`, `accent`. Sets:
   ```scss
   ion-card { --background: var(--ds-bg-2); margin: 0; box-shadow: none; }
   ```

7. **`ds-list-row`** (wraps `ion-item` inside `ion-list`)
   Composes `ion-item` with `lines="none"`, a leading icon slot, label
   stack, trailing pill + arrow. Themes via `::part(native)`:
   ```scss
   ion-item::part(native) {
     background: var(--ds-bg-2);
     border-radius: var(--ds-radius-2xl);
     border: 1px solid var(--ds-line-soft);
   }
   ```

8. **`ds-pill`** (wraps `ion-badge` OR `ion-chip`)
   Prefer `ion-badge` for compact status. Variants set
   `--ion-color-base/contrast` per status.

9. **`ds-tag`** (custom, very small — could be `ion-chip` with `--size`)
   Tag set: CV, OCR, NLP, ML, OPT, DETECT, AR. Color from token map.

10. **`ds-stat`** (custom block within `ion-card`)
    Value + label + accent color.

11. **`ds-progress`** (wraps `ion-progress-bar`)
    Theme `--progress-background` and `--background` for gradient via
    a wrapper element if Ionic's gradient support is limited.

12. **`ds-tabs`** (wraps `ion-segment`)
    Different visual treatment from chip-row: underlined, full-width.

13. **`ds-form-field`** (custom wrapper)
    Label + required marker + helper/error.
    Slot for the input control (an `ion-input`, `ion-select`, etc.).

14. **`ds-input`** (wraps `ion-input` with `fill="solid"` or `outline`)
    Theme via component vars + `::part(native)` for native text:
    ```scss
    ion-input {
      --background: var(--ds-bg-3);
      --color: var(--ds-txt-0);
      --placeholder-color: var(--ds-txt-3);
      --border-color: var(--ds-line);
      --border-radius: var(--ds-radius-md);
      --padding-start: var(--ds-space-3);
      --padding-end: var(--ds-space-3);
    }
    ```
    Variants: `default`, `readonly`, `qty` (large centered mono).

15. **`ds-qty-stepper`** (custom block using `ion-button` ×2 + `ion-input`)

16. **`ds-scan-button`** (uses `ion-button` with `expand="block"` and
    dashed border via custom SCSS on the button host)
    Output `(scan)` emits decoded value. The scan flow is provided by
    DI (`SCAN_PROVIDER` injection token) so the DS doesn't depend on a
    specific scanner plugin.

17. **`ds-toggle-row`** (uses `ion-toggle` inside `ion-item`)
    Theme `ion-toggle`:
    ```scss
    ion-toggle {
      --background: var(--ds-bg-3);
      --background-checked: var(--ds-accent);
      --handle-background: var(--ds-txt-1);
      --handle-background-checked: var(--ds-bg-0);
    }
    ```

18. **`ds-cta-bar`** (custom sticky bottom; uses `ion-button` ×1–2)
    Lives outside `ion-content` (inside `ion-footer`) so safe-area is
    handled by Ionic.

19. **`ds-button`** (wraps `ion-button`)
    Variants: `primary`, `secondary`, `ghost`, `danger`. Sizes
    `sm`/`md`/`lg`. Loading: shows `ion-spinner` instead of icon.
    Theme via `--background`, `--color`, `--border-radius`,
    `--padding-*` Ionic variables. NO deep selectors.

20. **`ds-fab`** (wraps `ion-fab` + `ion-fab-button`)
    Position handled by ion-fab `vertical`/`horizontal`. Theme button
    background to DS accent. Tooltip on hover for desktop only.

21. **`ds-bottom-sheet`** (wraps `ion-modal` with breakpoints)
    Set `breakpoints={[0, 0.9]}`, `initialBreakpoint={0.9}`,
    `handleBehavior="cycle"`. Theme:
    ```scss
    ion-modal {
      --background: var(--ds-bg-2);
      --border-radius: var(--ds-radius-modal) var(--ds-radius-modal) 0 0;
      --height: auto;
      --max-height: 88vh;
    }
    ```

22. **`ds-success-state`** (custom; uses `ion-icon` and `ion-text`)
    Animated check icon (CSS only — respects prefers-reduced-motion),
    title, message, key-value summary.

23. **`ds-empty-state`** (custom; uses `ion-icon`)

24. **`ds-bottom-nav`** (wraps `ion-tab-bar` + `ion-tab-button`)
    DO NOT roll your own tab bar — Ionic's handles platform conventions,
    haptic feedback (on iOS) and safe-area for the home indicator.

25. **`ds-icon`** (wraps `ion-icon`)
    Accepts either a known token name (mapped to an Ionicon name like
    `arrow-back-outline`) OR a raw `src` for custom SVG. Use the
    Ionicons that ship with Ionic — do NOT install another icon library.

## STEP 6 — SHADOW PARTS REFERENCE

Document a list of Ionic shadow parts the DS uses, in
`src/app/shared/design-system/SHADOW_PARTS.md`. Examples:
- `ion-item::part(native)` — outer wrapper background/border.
- `ion-input::part(native)` — the native `<input>` element.
- `ion-button::part(native)` — the native `<button>`.
- `ion-select::part(placeholder)`, `::part(icon)`.
- `ion-searchbar::part(container)`, `::part(icon)`, `::part(clear-button)`.
- `ion-toolbar::part(container)`.
- `ion-modal::part(content)`, `::part(backdrop)`, `::part(handle)`.

Use ONLY the parts that exist on the installed Ionic version (verify
against the docs for that version). Document each usage with a comment
linking to Ionic's docs page for that component.

## STEP 7 — GLOBAL CSS

Update `src/global.scss`:

```scss
/* Ionic core (already there) */
@import "@ionic/angular/css/core.css";
@import "@ionic/angular/css/normalize.css";
@import "@ionic/angular/css/structure.css";
@import "@ionic/angular/css/typography.css";
@import "@ionic/angular/css/display.css";
@import "@ionic/angular/css/padding.css";
@import "@ionic/angular/css/float-elements.css";
@import "@ionic/angular/css/text-alignment.css";
@import "@ionic/angular/css/text-transformation.css";
@import "@ionic/angular/css/flex-utils.css";

/* IONIC v8 ONLY — dark palette via system preference */
@import "@ionic/angular/css/palettes/dark.system.css";
/* OR for class-based manual toggle (uncomment if needed): */
/* @import "@ionic/angular/css/palettes/dark.class.css"; */

/* DS tokens & overrides (MUST come AFTER Ionic core + palette) */
@import "./app/shared/design-system/tokens";
@import "./app/shared/design-system/global-overrides";
```

The `global-overrides.scss` file holds DS-level styling of Ionic
primitives that we apply app-wide (search bar, toolbar, item, etc.).

## STEP 8 — STYLE GUIDE PAGE

Route `/design-system/preview` (lazy-loaded, gated by
`FF_DESIGN_SYSTEM_PREVIEW`). Sections:
1. Token swatches: colors, spacing, radii, shadows, type ramp.
2. Component gallery: one card per component with code snippet + live
   example + variant matrix.
3. Composition: two recomposed real screens (one list, one form) built
   only with DS components.
4. Platform mode toggle: a switch to force `.ios` or `.md` class on a
   sandbox container so reviewers can verify both look correct.
5. Theme toggle: light / dark (via the ThemeService).
6. RTL toggle: a switch that sets `dir="rtl"` on the sandbox container.

## STEP 9 — REFACTOR ONE EXISTING PAGE

Pick a small existing page (e.g., `InventoryHomePage`) and refactor it
to use ONLY DS components. Targets:
- 30–50% reduction in the page's SCSS line count.
- Zero hardcoded colors / sizes in the page.
- Existing tests still green.
- Visual diff: produce before/after screenshots in iOS mode AND md mode.

## RULES

- **No hardcoded colors / sizes / radii / shadows** in app code. Tokens only.
- **No deep selectors** into ion-* components.
- **No `!important`** without a justification comment.
- **Touch targets** ≥ 48×48.
- **Contrast** ≥ WCAG AA on text.
- **RTL** safe — logical properties only.
- **Reduced motion** honored on every transition.
- **Light theme** required and visually verified.
- **i18n** — DS components take strings as inputs; callers translate.
- **Platform parity** — every DS component looks correct in both iOS
  and MD modes. Verify in the style guide.

## TESTING

- Each component: unit test (renders, emits events) + a snapshot test
  of default state in both `ios` and `md` modes (force the mode via
  `Config.set` or by setting the class on a parent host).
- `ds-tokens.spec.ts` — asserts every required token is present in
  `getComputedStyle(document.documentElement)`.
- The refactored page keeps its existing tests green.
- E2E (if Cypress / Playwright is set up): snapshot the style guide
  page on iOS and MD modes.

## VERIFICATION

Run and report after each step + final:
- `npm run lint`
- `npm run typecheck` (or `tsc --noEmit`)
- `npm test -- src/app/shared/design-system`
- `ionic build --prod` (must succeed; no Ionic warnings about unknown
  CSS variables or deprecated APIs).
- Capacitor build (Android + iOS):
    - `npx cap sync android && npx cap open android`
    - `npx cap sync ios && npx cap open ios`
    The DS must render correctly inside the WebView on a real device or
    simulator (note: status bar coloring requires
    `@capacitor/status-bar` — install if absent and set the style in
    the ThemeService when toggling dark/light).
- Visual: open `/design-system/preview` on iOS Safari, Android Chrome,
  and the iOS/Android simulators. Attach 2 screenshots per device.
- Hardcoded-value sweep: a script (e.g. `scripts/check-no-hardcoded.sh`)
  that greps for `#[0-9a-f]{3,6}` color literals and `\d+px` outside
  the design-system folder. Allowlist documented in `tokens.md`.

## DO BEFORE WRITING CODE

1. Run STEP 0 (inspect existing app) and report.
2. Run STEP 1 (token extraction) and produce `tokens.md`.
3. Submit a PLAN: file list, refactor target, expected counts.
4. WAIT for my approval.
5. After approval, implement in this order, committing per step:
   a. tokens.scss
   b. variables.scss (Ionic mapping) + palette imports
   c. fonts + global.scss
   d. global-overrides.scss (Ionic primitive theming)
   e. SHADOW_PARTS.md reference
   f. wrapper components (in the order listed in STEP 5)
   g. style guide page
   h. refactor target page
   i. tests
   j. status bar wiring (Capacitor)
   k. hardcoded-value sweep + cleanup

## OUTPUT EXPECTED

1. ENVIRONMENT summary (STEP 0).
2. tokens.md (STEP 1).
3. Conflicts with the existing theme + resolution.
4. The PLAN.
5. Per-step commits with conventional-commit messages
   (`feat(ds): map ionic primary color to ds-accent`,
   `feat(ds): ds-list-row wraps ion-item`, etc.).
6. After each step: lint + tests + build results.
7. Final PR with:
   - new files + line counts,
   - screenshots of `/design-system/preview` in iOS and MD modes,
   - before/after of the refactored page (SCSS line count, screenshots),
   - hardcoded-value sweep results,
   - any deviations from the spec (with reason).

## NON-NEGOTIABLES

- Do NOT install another UI library (no Material, PrimeNG, Tailwind).
- Do NOT replace Ionic primitives — wrap them.
- Do NOT use deep selectors into ion-* shadow DOMs.
- Do NOT skip platform mode (iOS/MD) verification.
- Do NOT skip Capacitor build verification — Capacitor is how we ship
  to real devices, and Capacitor-specific issues (safe area, status
  bar, keyboard inset) need to be caught now.
- Do NOT skip light theme.
- Do NOT skip RTL.
````

---

## Placeholders to fill in before sending

| Placeholder | Example |
|---|---|
| `[REFS_PATH]` | `docs/design-references` (copy the 2 HTML mockups there first) |
| `[INVENTORY_MODULE_PATH]` | `src/app/modules/inventory/` |

---

## Quick checklist before sending

- [ ] Reference HTML files copied to `[REFS_PATH]`.
- [ ] Master Project Prompt already sent in this Claude Code session.
- [ ] Branch created: `feature/design-system`.
- [ ] `src/theme/variables.scss` exists (it does in any Ionic app).
- [ ] You can run `ionic build` locally (or the project's build command).
- [ ] Capacitor `android` and `ios` platforms added (`npx cap add`), or
      Claude is allowed to add them as part of this work.
- [ ] All `[BRACKETS]` replaced.

---

## Why this version actually works inside Ionic

| Concern | How this prompt handles it |
|---|---|
| **Customizing Ionic components** | Uses Ionic CSS Variables (`--ion-*` and per-component `--vars`) + CSS Shadow Parts (`::part(native)`). No deep selectors. |
| **Dark mode** | v8 → uses official palette files (`dark.system.css` / `dark.class.css`); v7 → `@media (prefers-color-scheme: dark)` in `variables.scss`. |
| **Light / dark / class toggle** | ThemeService sets a class on `<body>` and persists in `@ionic/storage`. |
| **Platform modes (iOS vs MD)** | Style guide includes a mode toggle; each component snapshot-tested in both modes; never targets `.ios` or `.md` at the palette level. |
| **Safe area** | Inherited from `ion-content`, `ion-header`, `ion-footer`, `ion-fab`. No manual padding hacks. |
| **Status bar** | `@capacitor/status-bar` wired to the ThemeService to sync native status bar color with the active theme. |
| **Native shell** | Verification step includes `npx cap sync` for Android + iOS so it's caught early if WebView rendering differs. |
| **RTL / Arabic** | Logical CSS properties only. Ionic auto-flips most primitives — DS must not break that. |
| **Font loading on mobile** | Fonts self-hosted under `src/assets/fonts/` so Capacitor bundles them and no external network call is needed on cold start. |
| **No CSS conflicts** | Token imports come AFTER Ionic palette imports in `global.scss` so DS wins; documented order. |
| **Future Ionic upgrades** | No deep selectors → upgrades won't silently break custom styles. |

---

## Tips for running this prompt

- **Run STEP 0 first.** Don't approve anything until Claude reports the
  Ionic version. The dark-mode strategy diverges at v7 vs v8.
- **Force STEP 1's `tokens.md` review.** Tokens are the foundation — fix
  names and values before 24 components import them.
- **Cap build is the real test.** A web-only preview will hide
  iOS Safari WebView quirks and Android keyboard issues.
- **One refactor target only.** Reject scope creep — additional page
  refactors go in follow-up PRs.
- **Sweep before merge.** The hardcoded-value sweep is the proof the
  system actually replaced the old approach.

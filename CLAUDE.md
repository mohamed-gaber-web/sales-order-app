# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm start          # Dev server at http://localhost:4200
npm run watch      # Build with watch mode

# Production
npm run build      # Production build to www/

# Quality
npm run lint       # ESLint on src/**/*.ts and src/**/*.html
npm test           # Karma/Jasmine tests in watch mode

# Mobile
npx cap sync       # Sync web assets to native iOS/Android projects
npx cap build      # Build native apps
```

## Architecture

**Grow Path** is an Ionic/Angular hybrid app (NgModules, not standalone components) that manages sales orders against a Microsoft Dynamics 365 OData API. It runs on both web (browser via a dev proxy or Vercel serverless) and native mobile (iOS/Android via Capacitor).

### Core Layer (`src/app/core/`)

- **`services/user-auth.service.ts`**: Sign-in, MFA, refresh and sign-out against the admin API (`POST /auth/login`, `/auth/mfa/verify`, `/auth/refresh`, `/auth/logout`). Email and password only — no tenant slug, because `user.email` is unique across the installation and the API resolves the workspace from it. `refresh()` is **single-flight**: the refresh token is single-use and a replay revokes the whole family, so two concurrent refreshes would sign the user out.
- **`auth/session.store.ts`**: The session, split three ways — identity persisted, refresh token persisted, **access token in memory only**.
- **`config/runtime-config.service.ts`**: What used to be `environment.ts`. Fetched from `GET /mobile/config?slug=` after sign-in and cached; launch never blocks on it.
- **`config/company-context.service.ts`**: Which legal entity, and therefore which D365 environment, requests are scoped to. Sends `x-d365-company`.
- **`storage/device-storage.service.ts`**: Capacitor Preferences. Purges the previous version's `localStorage` credentials on first run.
- **`interceptors/api-auth.interceptor.ts`**: Attaches the user's access token, and on 401 refreshes once and replays.
- **`api/api-contracts.ts`**: A transcription of the admin API's DTOs. Source of truth is `packages/contracts/src/schemas/` in the admin-portal repo.
- **`services/api.service.ts`**: Thin OData HTTP wrapper. Points at the API's `/d365` proxy — there is no native/web branch any more.
- **`lookup.service.ts`**: Companies, currencies and customers as Angular **signals**, loaded after sign-in rather than at startup — they are ERP reads and now need a session. Its `loadCompanies()` is still a cross-company OData sweep (used by the sales-order form) and goes through the proxy like everything else; `CompanyContextService` is the tenant-scoped list, and is the one to prefer for new code.
- **`theme.service.ts`**: Light/dark/system theme toggle; persists to localStorage; toggles `ion-palette-dark` on `<body>`.

### Routing & Pages

Feature modules are lazy-loaded:

| Route | Module | Pages |
|---|---|---|
| `/sales-order` | `SalesOrderModule` | list, create, edit/:id, view/:id |
| `/sales-order-line` | `SalesOrderLineModule` | form, detail |

### API / D365 Integration Pattern

**The app never talks to D365 directly.** Every ERP call goes to the admin API's
`/d365/data/*` and `/d365/api/services/*` routes, which forward to the tenant's
environment using a client secret sealed on the server. The device holds no ERP
credential — that is the whole point of the current architecture, and putting one
back into `environment.ts` would undo it.

- OData paths are unchanged from D365's own, so the ~95 call sites across the 20 domain services were untouched by the migration — only `ApiService.baseUrl` moved.
- OData queries use `$filter`, `$select`, `$top`, `$skip` for pagination (10 items/page).
- `SalesOrderService` queries `GP_SalesHeaderAndLineData` and `SalesOrderHeadersV3`.
- `SalesOrderLineService` queries `SalesOrderLines` with product variant lookups (sites, warehouses, configurations).
- All queries still hardcode `dataAreaId='usmf'`. `CompanyContextService.dataAreaId()` is where that should come from; replacing the 53 files that hardcode it is the remaining multi-company work.

### Platform Detection

`Platform.is('capacitor')` no longer decides where requests go — there is one path
now, on device and in a browser alike. It survives only in `DocumentOcrService`,
because OCR is a Vercel function rather than part of the API and so still has a
relative-versus-absolute URL problem.

Note that `CapacitorHttp` is enabled, so on device requests leave through the OS
and **bypass CORS entirely**. A device working proves nothing about whether the
API's `PORTAL_ORIGIN` allowlist is right for the browser build; test both.

## Code Conventions

- **ESLint**: Component selector prefix `app` (kebab-case); directive prefix `app` (camelCase); class suffix `Page` or `Component`. Standalone components disabled.
- **Formatting**: 2-space indent, UTF-8, single quotes in TypeScript, trailing newlines, no trailing whitespace.
- **State**: Angular signals (no external store). Lookups are global signals from `LookupService`.

## Environment & Secrets

`src/environments/environment.ts` and `environment.prod.ts` hold **no credentials
and no customer-specific values**. What is left is `platformApiBaseUrl` (where to
sign in), `ocrApiBaseUrl`, and `appVersion`. Everything else is fetched at runtime.

Do not add a secret here. If a device seems to need one, it needs an API endpoint
instead — a secret in a bundle and a secret fetched over TLS by anyone who knows a
tenant slug are the same secret, equally extractable.

## Key Dependencies

- Angular 20, Ionic 8, Capacitor 8 (`@capacitor/preferences` for persisted session state)
- RxJS 7.8, TypeScript 5.9 (strict mode)
- Jasmine 5.1 + Karma 6.4 (Chrome launcher)
- ESLint 9 with `@angular-eslint` and `@typescript-eslint`

## Design Context

### Users
Field sales reps and warehouse staff using the app on mobile while on the floor or in the field. Time-pressured; need information fast without hunting through UI. Occasionally on desktop for heavier data entry tasks.

### Brand Personality
Trustworthy · Professional · Precise

### Aesthetic Direction
Typography-led, structured, and calm — inspired by Linear and Notion. Navy primary (`#002559`) with orange accent (`#F24C1A`). No decorative clutter. Dark mode supported via `body.ion-palette-dark` CSS class.

### Design Principles
1. **Every word earns its place** — direct, present-tense labels and messages; no jargon, no redundancy.
2. **Status at a glance** — color-coded strips and badges surface state without requiring the user to read.
3. **Mobile-first, desktop-capable** — layouts adapt; no functionality is hidden on small screens.
4. **Calm under pressure** — no alarming microcopy; errors say what happened and what to do next.
5. **Consistent vocabulary** — pick one term per concept and use it everywhere (e.g., "Receive" not "Receive Item").

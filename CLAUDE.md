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

- **`auth.service.ts`**: Azure AD OAuth2 client credentials flow. Caches token in localStorage with expiry; refreshes automatically 5 min before expiry. On native (Capacitor), calls Azure directly with clientSecret; on web, calls `/api/token` proxy to keep the secret server-side.
- **`auth.interceptor.ts`**: Injects `Authorization: Bearer <token>` into D365-bound requests; retries on 401.
- **`api.service.ts`**: Thin OData HTTP wrapper. Routes to D365 directly on native, through proxy on web.
- **`lookup.service.ts`**: Holds companies, currencies, customers as Angular **signals** loaded at startup via `APP_INITIALIZER`.
- **`theme.service.ts`**: Light/dark/system theme toggle; persists to localStorage; toggles `ion-palette-dark` on `<body>`.

### Routing & Pages

Feature modules are lazy-loaded:

| Route | Module | Pages |
|---|---|---|
| `/sales-order` | `SalesOrderModule` | list, create, edit/:id, view/:id |
| `/sales-order-line` | `SalesOrderLineModule` | form, detail |

### API / D365 Integration Pattern

- OData queries use `$filter`, `$select`, `$top`, `$skip` for pagination (10 items/page).
- `SalesOrderService` queries `GP_SalesHeaderAndLineData` and `SalesOrderHeadersV3`.
- `SalesOrderLineService` queries `SalesOrderLines` with product variant lookups (sites, warehouses, configurations).
- All queries currently hardcode `dataAreaId='usmf'`. Extend this for multi-company support.

### Platform Detection

Use `Platform.is('capacitor')` to branch between native and web paths. Native goes direct to D365; web goes through the `/api/token` and `/data` proxies defined in `proxy.conf.js`.

## Code Conventions

- **ESLint**: Component selector prefix `app` (kebab-case); directive prefix `app` (camelCase); class suffix `Page` or `Component`. Standalone components disabled.
- **Formatting**: 2-space indent, UTF-8, single quotes in TypeScript, trailing newlines, no trailing whitespace.
- **State**: Angular signals (no external store). Lookups are global signals from `LookupService`.

## Environment & Secrets

- `src/environments/environment.ts` (dev) and `environment.prod.ts` — contain Azure AD `clientSecret` directly. On web deployments, the Vercel `/api/token` serverless function should inject the secret from environment variables instead.

## Key Dependencies

- Angular 20, Ionic 8, Capacitor 8
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

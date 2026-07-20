# Code Quality — Resolved Profile
scope: frontend (plus thin Vercel serverless /api/token proxy)
## Frontend
framework:        Angular 20 (NgModules, standalone disabled) + Ionic 8 + Capacitor 8
selector_prefix:  app (kebab-case components, camelCase directives)
styling:          SCSS, global theme in src/theme + per-component scss; navy #002559 / orange #F24C1A; dark mode via body.ion-palette-dark
design_system:    Ionic components + custom classes in app.component.scss / global.scss; icons: ionicons *-outline
i18n:             none (EN only)
state:            Angular signals (LookupService global signals); no external store
## Backend
language:         TypeScript (Vercel serverless functions in /api)
framework:        Vercel functions (token proxy only)
runtime:          Vercel / dev proxy (proxy.conf.js); native goes direct to D365
datastore:        Microsoft Dynamics 365 OData (external)
data_access:      OData via core/api.service.ts
auth_strategy:    Azure AD OAuth2 client credentials (auth.service.ts) + MSAL user SSO (user-auth.service.ts)
tenancy_model:    single-company (dataAreaId 'usmf' hardcoded)
input_validation: none formalized
webhook_providers: none
secrets_source:   env vars on Vercel; environment.ts contains clientSecret (known issue per CLAUDE.md)
## Rule sets in force
cited:    frontend-angular.md
advisory: typescript.md

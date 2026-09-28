# Van Sales — Discovery (Phase 0)

Output of `VAN_SALES_UPDATE_SPEC.md` §1. Written 2026-09-27 against branch `dev` (`771bb82`).
**Status: waiting for approval of the file plan (§9) and answers to §8.**

---

## 1. App structure

| | |
|---|---|
| Angular | 20 (`@angular/core ^20.0.0`) |
| Ionic | 8 (`@ionic/angular ^8.0.0`) |
| Capacitor | 8.0.2 (Android only — no iOS project) |
| Components | **NgModules**; standalone is disabled by ESLint |
| State | Angular **signals** in root services, no store. RxJS for HTTP |
| i18n | `@ngx-translate` 18, `src/assets/i18n/en.json` + `ar.json` (RTL) |
| Routing | `app-routing.module.ts` → `/inventory` → `pages/inventory/inventory-routing.module.ts` → `van-sales/van-sales-routing.module.ts` |

Van Sales lives under `/inventory/van-sales`. Its pages are in `src/app/pages/inventory/van-sales/`; its services are in `src/app/core/services/van-*.ts`; its models are in `src/app/models/van-*.ts`. The spec's suggested `van-sales/models/` folder does not match how this repo is laid out. **New code follows the repo layout** (see §9).

## 2. Existing screens → spec §7

| Route | Page | Spec screen | Notes |
|---|---|---|---|
| `/inventory/van-sales` | `journey/` (706 lines) | 7.1 Home | Route list + map, distance-ordered sequencing, KPIs |
| `visit/:id` | `visit/` | 7.2 Visit | Check-in is a button — **no distance check**. No-sale reasons exist |
| `catalog` → `cart` → `checkout` | 3 pages | 7.3 Sell | Unit price only. Posts a **real** D365 sales order (`VanSalesService.checkout`) |
| `collect/:id` | `collect/` | 7.4 Collect | Cash / single cheque, oldest-first preview. **Mocked** |
| `return/:id` | `return/` | 7.5 Return | Against invoice only. **Mocked** |
| `new-customer` | `new-customer/` | (API #35) | **Mocked** |
| `day-close` | `day-close/` | 7.9 Sync & day close | Basic cash + KPIs. **Mocked** |
| — | `label/` modal | 7.8 Receipt (partial) | Label after a sale |
| — | — | 7.6 Survey, 7.7 Deliver, 7.10 Supervisor | Not built |

## 3. HTTP layer

- **Auth is not Entra ID on the device.** The user signs in to the Grow Path admin portal (`core/auth/user-auth.service.ts`, `portal-auth.interceptor.ts` for bearer + refresh, MFA challenge). D365 is reached through the portal's pass-through `/d365/data/*` and `/d365/api/services/*`, and the portal holds the service-principal secret. So spec API #42 is already met by the portal session.
- `core/services/api.service.ts` wraps the proxy. On native it calls `environment.portalApiBaseUrl` absolutely; on web it uses `/api/portal`. The company goes in the `x-d365-company` header.
- The proxy returns **502, never 401**, for a D365 credential failure. The outbox retry logic must treat 502 as retryable and must not sign the user out on it.
- Retry: none at the HTTP level today. Error mapping: `portal-api.error.ts`.

## 4. Offline layer

- Storage: **localStorage only**. There is no Ionic Storage, no SQLite and no IndexedDB wrapper.
- `VanDayService` keeps the whole day (visits, KPIs, open invoices, outbox) in one localStorage key. `VanCartService` does the same for the cart.
- **The "outbox" is counters** (`VanOutbox { invoices, collections, returns, customerRequests, pending }`). It is not a queue of requests. Nothing is replayed, and there is no `MobileTransId`.
- Nothing listens for network changes, and there is no `@capacitor/network`.
- "Sync & day close" calls `VanFieldOpsService.closeDay()`, which returns a mocked result after a delay.

## 5. D365 calls made by Van Sales today

| Call | Real / mocked | Spec API # |
|---|---|---|
| GET `/data/ReleasedProductsV2`, `/data/ProductsV2` | Real | #5 |
| GET `/data/Warehouses` | Real | #11 |
| POST sales order (checkout) | Real | ≈ #25 / #24 |
| POST `/data/CustomerPaymentJournalHeaders` | Real (header only) | — |
| `GPVanSalesGroup/GPCollectionService/postPayment` | Mocked | #29 |
| `GPVanSalesGroup/GPReturnService/postReturn` | Mocked | #27 |
| `GPVanSalesGroup/GPCustomerRequestService/submit` | Mocked | #35 |
| `GPVanSalesGroup/GPDayCloseService/close` | Mocked | #41 |
| `/data/GPVisitLogEntity` | Mocked | #36 |
| `/data/GPJourneyPlanEntity`, `GPRouteCustomerEntity` | Seeded in `VanJourneyService` | #13, #1 |

**Naming conflict:** the existing code targets `GPVanSalesGroup/GP*Service` and `GP*Entity`. The new spec names `VSServices/VS*Service` and `VS*`. Both can't be right, and the backend team needs to confirm which one is (§8 Q5).

## 6. Capacitor plugins

| Installed | Missing (needed by spec) |
|---|---|
| app, camera, filesystem, share, haptics, keyboard, status-bar, mlkit barcode-scanning | `@capacitor/network` (F9), SQLite (F9, optional), thermal printer (F10), signature pad (F8, can be a plain canvas), QR renderer (F7) |

Geolocation uses `navigator.geolocation` in `DeviceLocationService`. There's no plugin, and that works on both platforms.

## 7. Models and tests

- `models/van-journey.model.ts`: `VanVisit` (≈ spec `Customer` + `JourneyStop`), `VanOpenInvoice`, `VanOutbox`, `VanDay`, `VanJourneyKpi`, `GeoPoint`, `VanPayMode = 'credit' | 'cod'`.
- `models/van-sales.model.ts`: `VanProduct`, `VanCartLine`, `VanCheckoutDetails`, `VanSaleResult`.
- The spec types (`RepSetup`, `PromotionRule`, `PricingResult`, `Cheque`, `ApprovalRequest`, `OutboxItem`) have no counterpart yet.
- Tests: Karma + Jasmine (`ng test --include=...`). Van tests today cover only `van-route.service.spec.ts`.
- Lint: ESLint 9 + angular-eslint. **The baseline has 224 existing errors** (mostly `ds-*` selector prefixes). The spec's "lint green" gate can only mean "no new errors" until those are fixed separately.

## 8. Open questions

From the spec (§13):
1. D365 Commerce licence? If yes, use standard promotions and loyalty instead of `VSPromotions` / `VSLoyaltyRules`.
2. Approvals: in-app supervisor only, or D365 Workflow?
3. Thermal printer model and plugin?
4. Middleware (APIM / Logic Apps) base URL for ETA? Should it go through the portal API instead?
5. Service body wrapper key and response envelope. Also: `GPVanSalesGroup/GP*` or `VSServices/VS*`?

Added by discovery:

6. **Role source.** Should it be the portal (permissions on the signed-in user) or D365 `VSRepSetups` (#12)? Recommendation: the portal decides *what the user may do*; #12 supplies *setup only* (van, limits, number sequences, device serial). This keeps one authority for access and matches how the portal already separates modules from permissions.
7. **Tax authority.** Existing return code carries `zatcaQrBase64` (Saudi ZATCA). The new spec is Egypt ETA. Which applies, or both, per tenant?
8. **Overlapping menu groups.** `route-tracking`, `trade-payments` and `distribution` hold "coming soon" items that this spec delivers inside Van Sales (promotions, customer credit, e-payment, supervisor). Should we leave them, or retire them in the portal's module catalogue? That second option changes the portal too.
9. **Offline storage.** Keep localStorage for the outbox (simple, ~5 MB, fine for JSON without photos), or add SQLite now? Photos and signatures should go to `@capacitor/filesystem`, never localStorage.

## 9. Proposed file plan

### Already done in this checkpoint: Van Sales sub-menu

- `src/app/app-menu.ts`: the Van Sales group now lists Today's Route, Pre-Sales Orders, Deliveries, Collections, Van Stock, New Customer Request, Sync & Day Close and Supervisor. Items not yet built are "coming soon". Added `MenuItem.exact` so Today's Route isn't highlighted on its child pages.
- `src/app/app.component.html`: binds `routerLinkActiveOptions` to `item.exact` (shared shell, one attribute).
- `src/assets/i18n/en.json`, `ar.json`: new `menu.items.*` keys. Replaced keys: `preSales`, `vanSales` (item), `orderManagement`, `mobileInvoicing`.

### Phase 1: foundations (new files unless noted)

```
src/app/models/van-sales-spec.model.ts        spec §4 types (Role, RepSetup, PromotionRule, PricingResult, Cheque, ApprovalRequest, OutboxItem…)
src/app/core/van-sales/van-sales-endpoints.ts all paths + wrapper key in one place (§6.2)
src/app/core/van-sales/van-sales-api.ts       VanSalesApi interface + injection token
src/app/core/van-sales/van-sales-http.api.ts  real adapter over ApiService (/d365 proxy)
src/app/core/van-sales/van-sales-mock.api.ts  in-memory, seeded, idempotent on MobileTransId
src/app/core/van-sales/van-outbox.service.ts  persistent FIFO queue, deps, backoff, FAILED after 5
src/app/core/van-sales/network-status.service.ts  wraps @capacitor/network (new dependency)
src/app/core/van-sales/*.spec.ts              outbox + mock idempotency tests
src/environments/environment*.ts  (modify)    vanSalesApi: 'http' | 'mock', mockEndpoints: number[]
package.json (modify)                          + @capacitor/network
```

### Phases 2–9: one checkpoint each, per spec §10

- New pages under `pages/inventory/van-sales/`: `orders/`, `deliveries/` (+ signature component), `collections/`, `stock/`, `supervisor/`, `survey/`, `receipt/`.
- New services in `core/van-sales/`: role, pricing engine, credit, settlement, approval, printer.
- Menu items become live as their page lands.
- Existing pages that get extended: journey, visit, checkout, collect, return, day-close. `VanFieldOpsService` gets replaced by the adapter.

Nothing outside Van Sales is touched, apart from the shared items listed above (menu shell, i18n, environment files, `package.json`).

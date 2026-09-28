# Van Sales — implementation status

Written 2026-09-27. Covers every feature in `VAN_SALES_UPDATE_SPEC.md` (F1–F14), running against the **mock backend**. `environment.vanSalesApi: 'mock'` is the default, and it stays that way until the X++ services ship.

## Where things are

| Layer | Path |
|---|---|
| Models, endpoints (#1–#46), API contract | `src/app/core/van-sales/van-sales.models.ts`, `van-sales-endpoints.ts`, `van-sales-api.ts` |
| Real adapter (via portal `/d365`) / mock / per-endpoint router | `van-sales-http.api.ts`, `van-sales-mock.api.ts` (+ `.data.ts`), `van-sales-api.router.ts` |
| Offline outbox (idempotent, FIFO + dependencies, backoff, FAILED after 5) | `van-outbox.service.ts` |
| Pricing engine (pure) and business rules (credit, settlement, cheques, returns, tax doc kind) | `pricing-engine.ts`, `van-rules.ts` |
| Master data cache, roles, approvals, documents, transactions | `van-store.service.ts`, `van-role.service.ts`, `van-approval.service.ts`, `van-documents.service.ts`, `van-transactions.service.ts` |
| Screens | `src/app/pages/inventory/van-sales/*` — journey, visit, sell, receipt, collect, collections, return, survey, orders, deliveries, deliver, stock, new-customer, day-close, supervisor |

Unit tests: `pricing-engine.spec.ts`, `van-rules.spec.ts` and `van-outbox.service.spec.ts` cover each pricing rule, rounding, expired and exhausted promotions, limits, settlement, cheque validation, idempotency, dependencies, backoff, and mock scenarios 3, 4, 7, 8 and 10.

## Trying it

`npm start`, sign in, open **Van Sales → Today's Route**. The dev tools panel at the bottom of the route screen (dev builds only) has:
- a role switcher (van seller, pre-seller, delivery rep, collector, supervisor)
- *Simulate offline*
- *At customer* (skips the geofence)
- *Reset demo data*

## Deviations from the spec

- **Credit override id:** `#25` and `#24` carry a separate `CreditApprovalId` alongside `ApprovalId` (the discount), because one document can need both.
- **Approvals endpoints:** approvals (`#90–92`) and cheque status (`#93`) are new service numbers. The spec left the transport open (Q2).
- **Business rejections:** a rejection (`Success: false` / 4xx) fails at once instead of retrying 5 times.
- **Pull while unsent:** a master-data pull while the outbox holds unsent work keeps the local balances, stock and orders.
- **Delta pull:** not implemented. Every pull is a full pull.
- **Printing:** no Bluetooth printer plugin yet. **Print** shares plain text instead. `VanPrinterService.sendToPrinter` is the place to wire one in.
- **i18n:** menu labels are in EN and AR. Screen copy is inline English, matching the existing van pages.
- **`environment.ts`:** it is skip-worktree on dev machines, so the new flags are read through `van-sales.config.ts` with safe defaults.

## Still open (see DISCOVERY.md §8)

1. Service names: `GPVanSalesGroup/GP*` or `VSServices/VS*`? The endpoints file uses `VS*`.
2. Role source: portal permissions, or `VSRepSetups`?
3. ETA middleware base URL (`etaMiddlewareBaseUrl`).
4. ZATCA or ETA?
5. Printer model and plugin.
6. `@capacitor/network` was added, so run `npx cap sync android` before the next APK.

import { inject, Injectable } from '@angular/core';
import { map, Observable, of, throwError } from 'rxjs';
import { catchError, shareReplay, switchMap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import { SalesOrderService } from './sales-order.service';
import { Warehouse } from '../../models/inventory.model';
import { VanCartLine, VanCheckoutDetails, VanProduct, VanSaleResult } from '../../models/van-sales.model';

/** Products fetched per server page. One page is ~9 KB. */
export const VAN_PAGE_SIZE = 24;

/** Verified against the live entity — every column here exists on ProductsV2. */
const PRODUCT_SELECT =
  'ProductNumber,ProductName,ProductSearchName,ProductType,ProductSubType,ProductDescription';

/** Search only needs identifiers and names, which is ~250 KB lighter than the full projection. */
const SEARCH_SELECT = 'ProductNumber,ProductName,ProductSearchName';

/**
 * ReleasedProductsV2 carries the sales price and unit. `ProductName` is NOT a
 * column on this entity (it is on ProductsV2) — selecting it fails the request.
 */
const RELEASED_SELECT = 'ItemNumber,SalesPrice,SalesUnitSymbol,ProductSearchName';

const DATA_AREA_ID = 'usmf';

interface ProductsV2Row {
  ProductNumber: string;
  ProductName?: string;
  ProductSearchName?: string;
  ProductType?: string;
  ProductSubType?: string;
  ProductDescription?: string;
  /**
   * ProductsV2 exposes no image column in this environment, so this is
   * effectively always absent — see `readImageUrl`.
   */
  [extra: string]: unknown;
}

interface ReleasedProductRow {
  ItemNumber: string;
  SalesPrice?: number;
  SalesUnitSymbol?: string;
  ProductSearchName?: string;
}

export interface VanProductPage {
  items: VanProduct[];
  /** Total rows on the server for this query, from `$count`. */
  total: number;
}

/**
 * Catalogue access for the van sales flow.
 *
 * Every browse request is paged with `$top`/`$skip`/`$count` — nothing reads a
 * whole entity. Sizing measured against the live tenant: all of ProductsV2 is
 * 1,688 rows / 714 KB / 3.7 s, versus 9 KB for a 24-row page.
 *
 * Search is the one exception, and unavoidably so: this tenant rejects every
 * OData string function (`contains`, `startswith` and `tolower` all 400), so
 * matching has to happen client-side over a list it has already fetched. Those
 * lists load lazily — only when the driver actually types — and are cached for
 * the session. Browsing and scanning never touch them.
 */
@Injectable({ providedIn: 'root' })
export class VanSalesService {
  private api = inject(ApiService);
  private salesOrderService = inject(SalesOrderService);

  private sellableAll$?: Observable<VanProduct[]>;
  private searchIndex$?: Observable<VanProduct[]>;

  /** Drops the lazy search caches so the next search re-reads (pull-to-refresh). */
  invalidate(): void {
    this.sellableAll$ = undefined;
    this.searchIndex$ = undefined;
  }

  // ── Paged browse ───────────────────────────────────────────────────────────

  /**
   * One server page of sellable products — the released items that carry a price
   * and can actually go off the van.
   *
   * ReleasedProductsV2 already has the price, unit and name, so a page is
   * self-sufficient: one ~8.5 KB request, no follow-up lookups.
   */
  getSellablePage(skip: number, top = VAN_PAGE_SIZE): Observable<VanProductPage> {
    return this.api
      .get<ODataResponse<ReleasedProductRow>>('/data/ReleasedProductsV2', {
        '$select': RELEASED_SELECT,
        '$filter': `dataAreaId eq '${DATA_AREA_ID}'`,
        '$orderby': 'ItemNumber asc',
        '$top': String(top),
        '$skip': String(skip),
        '$count': 'true',
      })
      .pipe(
        map((res) => ({
          items: (res.value ?? []).map((r) => this.fromReleased(r)),
          total: res['@odata.count'] ?? 0,
        }))
      );
  }

  /**
   * One server page of the whole catalogue, plus a single follow-up request that
   * fetches prices for exactly the item numbers on that page (an `or` chain of
   * `eq`, the only string comparison this tenant allows).
   */
  getAllPage(skip: number, top = VAN_PAGE_SIZE): Observable<VanProductPage> {
    return this.api
      .get<ODataResponse<ProductsV2Row>>('/data/ProductsV2', {
        '$select': PRODUCT_SELECT,
        '$orderby': 'ProductNumber asc',
        '$top': String(top),
        '$skip': String(skip),
        '$count': 'true',
      })
      .pipe(
        switchMap((res) => {
          const rows = res.value ?? [];
          const total = res['@odata.count'] ?? 0;
          // getPricesFor swallows its own failures, so a missing price map
          // degrades the page to "no prices" rather than breaking browsing.
          return this.getPricesFor(rows.map((r) => r.ProductNumber)).pipe(
            map((prices) => ({ items: this.enrich(rows, prices), total }))
          );
        })
      );
  }

  /** Prices for a specific set of item numbers, in one request. Empty input skips the call. */
  private getPricesFor(itemNumbers: string[]): Observable<Map<string, ReleasedProductRow>> {
    const ids = itemNumbers.filter(Boolean);
    if (ids.length === 0) return of(new Map());

    const clause = ids.map((n) => `ItemNumber eq '${n.replace(/'/g, "''")}'`).join(' or ');
    return this.api
      .get<ODataResponse<ReleasedProductRow>>('/data/ReleasedProductsV2', {
        '$select': RELEASED_SELECT,
        '$filter': `dataAreaId eq '${DATA_AREA_ID}' and (${clause})`,
        '$top': String(ids.length),
      })
      .pipe(
        map((res) => new Map((res.value ?? []).map((r) => [r.ItemNumber, r]))),
        catchError(() => of(new Map<string, ReleasedProductRow>()))
      );
  }

  // ── Scanning ───────────────────────────────────────────────────────────────

  /**
   * Resolves a scanned code with two tiny targeted requests. `eq` is the only
   * string operator this tenant allows, and it means scanning never waits on a
   * catalogue page or a search index.
   */
  findByItemNumber(itemNumber: string): Observable<VanProduct | null> {
    const safe = itemNumber.trim().replace(/'/g, "''");
    if (!safe) return of(null);

    return this.api
      .get<ODataResponse<ProductsV2Row>>('/data/ProductsV2', {
        '$select': PRODUCT_SELECT,
        '$filter': `ProductNumber eq '${safe}'`,
        '$top': '1',
      })
      .pipe(
        switchMap((res) => {
          const row = res.value?.[0];
          if (!row) return of(null);
          return this.getPricesFor([row.ProductNumber]).pipe(
            map((prices) => this.enrich([row], prices)[0] ?? null)
          );
        })
      );
  }

  // ── Search (lazy — nothing below runs until the driver types) ───────────────

  /** True once the sellable search list is cached. */
  get isSellableIndexReady(): boolean {
    return !!this.sellableAll$;
  }

  /** True once the full-catalogue search index is cached. */
  get isSearchIndexReady(): boolean {
    return !!this.searchIndex$;
  }

  /**
   * Substring search across sellable products. Pulls the released list once
   * (206 rows / 63 KB) the first time the driver searches, then filters in
   * memory — there is no server-side alternative on this tenant.
   */
  searchSellable(term: string, limit = 60): Observable<VanProduct[]> {
    const lower = term.trim().toLowerCase();
    if (!lower) return of([]);
    return this.getSellableAll().pipe(map((all) => this.match(all, lower, limit)));
  }

  /**
   * Substring search across the whole catalogue. Pulls a names-only index once
   * (1,688 rows / 455 KB), then enriches only the matches with prices, so the
   * expensive read happens at most once per session and only on demand.
   */
  searchAllProducts(term: string, limit = 60): Observable<VanProduct[]> {
    const lower = term.trim().toLowerCase();
    if (!lower) return of([]);

    return this.getSearchIndex().pipe(
      map((index) => this.match(index, lower, limit)),
      switchMap((matches) =>
        this.getPricesFor(matches.map((m) => m.itemNumber)).pipe(
          map((prices) =>
            matches.map((m) => {
              const rel = prices.get(m.itemNumber);
              return {
                ...m,
                price: rel?.SalesPrice,
                unit: rel?.SalesUnitSymbol,
                isSellable: !!rel,
              };
            })
          )
        )
      )
    );
  }

  private match(list: VanProduct[], lower: string, limit: number): VanProduct[] {
    return list
      .filter(
        (p) =>
          p.itemNumber.toLowerCase().includes(lower) ||
          p.name.toLowerCase().includes(lower) ||
          (p.searchName ?? '').toLowerCase().includes(lower)
      )
      .slice(0, limit);
  }

  private getSellableAll(): Observable<VanProduct[]> {
    if (!this.sellableAll$) {
      this.sellableAll$ = this.api
        .get<ODataResponse<ReleasedProductRow>>('/data/ReleasedProductsV2', {
          '$select': RELEASED_SELECT,
          '$filter': `dataAreaId eq '${DATA_AREA_ID}'`,
          '$orderby': 'ItemNumber asc',
        })
        .pipe(
          map((res) => (res.value ?? []).map((r) => this.fromReleased(r))),
          shareReplay(1),
          catchError((err) => {
            this.sellableAll$ = undefined; // a failed load isn't cached
            return throwError(() => err);
          })
        );
    }
    return this.sellableAll$;
  }

  private getSearchIndex(): Observable<VanProduct[]> {
    if (!this.searchIndex$) {
      this.searchIndex$ = this.api
        .get<ODataResponse<ProductsV2Row>>('/data/ProductsV2', {
          '$select': SEARCH_SELECT,
          '$orderby': 'ProductNumber asc',
        })
        .pipe(
          map((res) =>
            (res.value ?? []).map((p) => ({
              itemNumber: p.ProductNumber,
              name: p.ProductName || p.ProductSearchName || p.ProductNumber,
              searchName: p.ProductSearchName,
              isSellable: false,
            }))
          ),
          shareReplay(1),
          catchError((err) => {
            this.searchIndex$ = undefined;
            return throwError(() => err);
          })
        );
    }
    return this.searchIndex$;
  }

  // ── Shaping ────────────────────────────────────────────────────────────────

  private fromReleased(r: ReleasedProductRow): VanProduct {
    return {
      itemNumber: r.ItemNumber,
      // ReleasedProductsV2 has no ProductName column; ProductSearchName is
      // D365's own default for it.
      name: r.ProductSearchName || r.ItemNumber,
      searchName: r.ProductSearchName,
      price: r.SalesPrice,
      unit: r.SalesUnitSymbol,
      isSellable: true,
    };
  }

  private enrich(rows: ProductsV2Row[], prices: Map<string, ReleasedProductRow>): VanProduct[] {
    return rows.map((p) => {
      const rel = prices.get(p.ProductNumber);
      const description = (p.ProductDescription ?? '').trim();
      return {
        itemNumber: p.ProductNumber,
        name: p.ProductName || p.ProductSearchName || p.ProductNumber,
        searchName: p.ProductSearchName,
        description: description || undefined,
        productType: p.ProductType,
        imageUrl: this.readImageUrl(p),
        price: rel?.SalesPrice,
        unit: rel?.SalesUnitSymbol,
        isSellable: !!rel,
      };
    });
  }

  /**
   * Reads a product image off the API row when one is present.
   *
   * ProductsV2 in this environment returns no image column (checked against the
   * live entity — the row has ProductNumber/Name/SearchName/Type/Description and
   * no picture field), and the retail image chain
   * (RetailMediaProductRelations → RetailMediaResources) only yields partial
   * URLs like `Products/1100_a.png` with no CDN base configured, so nothing
   * resolves today. The catalogue therefore renders an initial tile.
   *
   * This stays here so that if the entity is extended with any of the usual
   * image columns, images light up without touching the pages. Add the column to
   * PRODUCT_SELECT at the same time — $select drops anything not listed.
   */
  private readImageUrl(row: ProductsV2Row): string | undefined {
    const candidates = [
      'ImageUrl',
      'ProductImageUrl',
      'Image',
      'ProductImage',
      'Picture',
      'ThumbnailUrl',
    ];
    for (const key of candidates) {
      const value = row[key];
      if (typeof value !== 'string' || !value.trim()) continue;
      const v = value.trim();
      if (/^(https?:|data:)/i.test(v)) return v;
      // Bare base64 payload (as RetailImages returns) — wrap it so <img> accepts it.
      if (/^[A-Za-z0-9+/=\s]{64,}$/.test(v)) return `data:image/png;base64,${v.replace(/\s/g, '')}`;
    }
    return undefined;
  }

  // ── Van location ───────────────────────────────────────────────────────────

  /** Warehouses the driver can sell from. Carries the site, so one picker covers both. */
  getWarehouses(): Observable<Warehouse[]> {
    return this.api
      .get<ODataResponse<Warehouse>>('/data/Warehouses', {
        '$orderby': 'WarehouseId asc',
        '$top': '500',
      })
      .pipe(map((res) => res.value ?? []));
  }

  // ── Checkout ───────────────────────────────────────────────────────────────

  /**
   * Order numbers are supplied by the app rather than a D365 number sequence, so
   * they must be unique and ≤ 20 characters. `VAN-yyMMdd-HHmmss` is both, and
   * stays readable on a printed label.
   */
  buildOrderNumber(now = new Date()): string {
    const p2 = (n: number) => String(n).padStart(2, '0');
    const date = `${p2(now.getFullYear() % 100)}${p2(now.getMonth() + 1)}${p2(now.getDate())}`;
    const time = `${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`;
    return `VAN-${date}-${time}`;
  }

  /**
   * Creates the sales order and one line per cart item. A line D365 rejects is
   * reported in `failedItems` — the order still exists, so the driver is told
   * exactly what didn't make it rather than losing the whole sale.
   */
  checkout(details: VanCheckoutDetails, lines: VanCartLine[]): Observable<VanSaleResult> {
    const orderNumber = this.buildOrderNumber();
    const soldAt = new Date();

    return this.salesOrderService
      .createOrderWithLines(
        {
          dataAreaId: DATA_AREA_ID,
          SalesOrderNumber: orderNumber,
          CurrencyCode: details.currencyCode,
          OrderingCustomerAccountNumber: details.customerAccount,
        },
        lines.map((line) => ({
          ItemNumber: line.itemNumber,
          OrderedSalesQuantity: line.qty,
          SalesPrice: line.price,
          ShippingSiteId: details.siteId,
          ShippingWarehouseId: details.warehouseId,
          ProductConfigurationId: '',
          ProductSizeId: '',
          ProductColorId: '',
          ProductStyleId: '',
        }))
      )
      .pipe(
        map((res) => ({
          orderNumber: res.orderNumber,
          customerAccount: details.customerAccount,
          customerName: details.customerName,
          currencyCode: details.currencyCode,
          siteId: details.siteId,
          warehouseId: details.warehouseId,
          lines,
          totalQty: lines.reduce((sum, l) => sum + l.qty, 0),
          totalAmount: lines.reduce((sum, l) => sum + l.qty * l.price, 0),
          failedItems: res.failedItems,
          soldAt,
        }))
      );
  }
}

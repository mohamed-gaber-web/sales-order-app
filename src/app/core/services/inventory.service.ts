import { Injectable, inject } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, switchMap, timeout } from 'rxjs/operators';
import { ApiService } from './api.service';
import { containsFilter, odataString, prefixFilter } from './odata-filter';
import { ODataResponse } from '../models/lookup.models';
import {
  Warehouse,
  InventoryOnHand,
  InventoryProduct,
  WarehouseLocation,
} from '../../models/inventory.model';
import { TenantConfigStore } from '../tenant/tenant-config.store';

export const INV_PAGE_SIZE = 20;

/** A scanned code resolved to an item, plus the variant a barcode pins, if any. */
export interface ScannedItem {
  product: InventoryProduct;
  variant?: {
    ProductConfigurationId: string;
    ProductSizeId: string;
    ProductColorId: string;
    ProductStyleId: string;
  };
}

/**
 * Items come from the released products of the company the app works in.
 * `cross-company` plus a dataAreaId filter, because without it D365 answers
 * for the service principal's default company, which may not be this one.
 */
const RELEASED_PRODUCTS = '/data/ReleasedProductCreationsV2';
const RELEASED_PRODUCT_SELECT = 'ItemNumber,ProductNumber,ProductName,ProductDescription';

interface ReleasedProductRow {
  ItemNumber: string;
  ProductNumber?: string;
  ProductName?: string;
  ProductDescription?: string;
}

/**
 * How long the name search may take before only the item-number matches are
 * shown. A leading wildcard can't use an index, so on a large catalogue it may
 * be slow; the starts-with number search beside it stays fast.
 */
const NAME_SEARCH_TIMEOUT_MS = 8000;

/** The item number is what order lines and on-hand use, so it becomes the product's number. */
function toInventoryProduct(row: ReleasedProductRow): InventoryProduct {
  return {
    ProductNumber: row.ItemNumber,
    ProductName: row.ProductName || row.ProductDescription,
    ProductDescription: row.ProductDescription,
  };
}

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private tenant = inject(TenantConfigStore);

  constructor(private api: ApiService) {}

  // ── Warehouses ─────────────────────────────────────────────────────────────

  getWarehouses(siteId?: string): Observable<ODataResponse<Warehouse>> {
    const params: Record<string, string> = {
      '$orderby': 'WarehouseId asc',
      '$top': '200',
    };
    if (siteId) {
      params['$filter'] = `OperationalSiteId eq '${siteId}'`;
    }
    return this.api.get<ODataResponse<Warehouse>>('/data/Warehouses', params);
  }

  // ── On-Hand ────────────────────────────────────────────────────────────────

  getOnHandByItem(
    itemNumber: string,
    warehouseId?: string
  ): Observable<ODataResponse<InventoryOnHand>> {
    let filter = `ItemNumber eq '${itemNumber}'`;
    if (warehouseId) filter += ` and InventoryWarehouseId eq '${warehouseId}'`;
    return this.api.get<ODataResponse<InventoryOnHand>>(
      '/data/WarehousesOnHandV2',
      { '$filter': filter, '$top': '100' }
    );
  }

  getOnHandByWarehouse(warehouseId: string): Observable<ODataResponse<InventoryOnHand>> {
    return this.api.get<ODataResponse<InventoryOnHand>>(
      '/data/WarehousesOnHandV2',
      {
        '$filter': `InventoryWarehouseId eq '${warehouseId}'`,
        '$top': String(INV_PAGE_SIZE),
        '$orderby': 'ItemNumber asc',
      }
    );
  }

  getAllOnHand(skip = 0): Observable<ODataResponse<InventoryOnHand>> {
    return this.api.get<ODataResponse<InventoryOnHand>>(
      '/data/WarehousesOnHandV2',
      {
        '$top': String(INV_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
        '$orderby': 'ItemNumber asc',
      }
    );
  }

  searchOnHand(
    term: string,
    warehouseId?: string,
    skip = 0
  ): Observable<ODataResponse<InventoryOnHand>> {
    let filter = `contains(ItemNumber,'${term}')`;
    if (warehouseId) filter += ` and InventoryWarehouseId eq '${warehouseId}'`;
    return this.api.get<ODataResponse<InventoryOnHand>>(
      '/data/WarehousesOnHandV2',
      {
        '$filter': filter,
        '$top': String(INV_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
      }
    );
  }

  // ── Products ───────────────────────────────────────────────────────────────

  /** Query params for released products of the current company, plus any extra filter. */
  private releasedParams(extraFilter?: string): Record<string, string> {
    const company = this.tenant.currentDataAreaId().replace(/'/g, "''");
    return {
      'cross-company': 'true',
      '$filter': `dataAreaId eq '${company}'` + (extraFilter ? ` and ${extraFilter}` : ''),
      '$select': RELEASED_PRODUCT_SELECT,
    };
  }

  private getReleased(params: Record<string, string>): Observable<ODataResponse<InventoryProduct>> {
    return this.api
      .get<ODataResponse<ReleasedProductRow>>(RELEASED_PRODUCTS, params)
      .pipe(map((res) => ({ ...res, value: res.value.map(toInventoryProduct) })));
  }

  getProducts(skip = 0): Observable<ODataResponse<InventoryProduct>> {
    return this.getReleased({
      ...this.releasedParams(),
      '$top': String(INV_PAGE_SIZE),
      '$skip': String(skip),
      '$count': 'true',
      '$orderby': 'ItemNumber asc',
    });
  }

  /**
   * Set once D365 refuses the name search, so later searches skip straight to the
   * item-number search instead of paying for a failed request each time.
   */
  private nameSearchUnsupported = false;

  /**
   * Items matching the term, searched on the server and capped at `limit`.
   *
   * Never by downloading the catalogue: a company's released products run
   * to far more rows than the gateway will wait for (it answered 504).
   *
   * Item numbers that start with the term come first (`ItemNumber eq '622*'`,
   * which an index serves quickly), then items whose number or name contains
   * it (`eq '*622*'`). D365 accepts only these wildcard eq filters — not
   * contains/startswith, nor ge/lt on strings. The contains search is cut off
   * after NAME_SEARCH_TIMEOUT_MS if slow, and if the starts-with search is
   * refused it falls back to an exact match, so something always comes back.
   */
  searchProducts(term: string, limit = 50): Observable<InventoryProduct[]> {
    const t = term.trim();
    if (!t) return of([]);

    const numbers = (filter: string) =>
      this.getReleased({
        ...this.releasedParams(filter),
        '$top': String(limit),
        '$orderby': 'ItemNumber asc',
      }).pipe(map((res) => res.value));
    const byNumber$ = numbers(prefixFilter('ItemNumber', t)).pipe(
      catchError(() => numbers(`ItemNumber eq '${odataString(t)}'`))
    );

    const byName$: Observable<InventoryProduct[]> = this.nameSearchUnsupported
      ? of([])
      : this.getReleased({
          ...this.releasedParams(`(${containsFilter('ItemNumber', t)} or ${containsFilter('ProductName', t)})`),
          '$top': String(limit),
        }).pipe(
          timeout(NAME_SEARCH_TIMEOUT_MS),
          map((res) => res.value),
          catchError((err) => {
            // A 400 means the filter itself is refused; a timeout or outage
            // says nothing about support, so the next search tries again.
            if (err?.status === 400 || err?.status === 501) this.nameSearchUnsupported = true;
            return of([]);
          })
        );

    return forkJoin([byNumber$, byName$]).pipe(
      map(([numbers, names]) => {
        const seen = new Map<string, InventoryProduct>();
        for (const p of [...numbers, ...names]) {
          if (!seen.has(p.ProductNumber)) seen.set(p.ProductNumber, p);
        }
        return [...seen.values()].slice(0, limit);
      })
    );
  }

  /** One item by its item number, in the current company. */
  getProductByNumber(itemNumber: string): Observable<ODataResponse<InventoryProduct>> {
    const safe = itemNumber.replace(/'/g, "''");
    return this.getReleased({ ...this.releasedParams(`ItemNumber eq '${safe}'`), '$top': '1' });
  }

  /**
   * What a scanned code names: an item number first, then a barcode. A barcode
   * can pin one variant, so its dimensions come back for the caller to
   * preselect. Resolves to null when neither matches.
   *
   * The ItemBarcodes field names (`Barcode`, `ItemNumber`, Product*Id) are not
   * yet verified against this environment's $metadata — no $select, so an
   * unknown column cannot fail the request, and any failure here counts as
   * "no match" rather than an error.
   */
  findItemByScan(code: string): Observable<ScannedItem | null> {
    const safe = code.trim().replace(/'/g, "''");
    const byBarcode$ = this.api
      .get<ODataResponse<Record<string, unknown>>>('/data/ItemBarcodes', {
        '$filter': `Barcode eq '${safe}'`,
        '$top': '1',
      })
      .pipe(
        switchMap((res) => {
          const row = res.value[0];
          const itemNumber = row?.['ItemNumber'];
          if (typeof itemNumber !== 'string' || !itemNumber) return of(null);
          const dim = (k: string) => (typeof row[k] === 'string' ? (row[k] as string) : '');
          return this.getProductByNumber(itemNumber).pipe(
            map((p) =>
              p.value[0]
                ? {
                    product: p.value[0],
                    variant: {
                      ProductConfigurationId: dim('ProductConfigurationId'),
                      ProductSizeId: dim('ProductSizeId'),
                      ProductColorId: dim('ProductColorId'),
                      ProductStyleId: dim('ProductStyleId'),
                    },
                  }
                : null
            )
          );
        }),
        catchError(() => of(null))
      );

    return this.getProductByNumber(code.trim()).pipe(
      switchMap((res) => (res.value[0] ? of({ product: res.value[0] }) : byBarcode$))
    );
  }

  // ── Warehouse Locations ─────────────────────────────────────────────────────

  getLocations(
    warehouseId: string,
    skip = 0,
    searchTerm?: string
  ): Observable<ODataResponse<WarehouseLocation>> {
    let filter = `WarehouseId eq '${warehouseId}'`;
    if (searchTerm) {
      filter += ` and contains(LocationId,'${searchTerm}')`;
    }
    return this.api.get<ODataResponse<WarehouseLocation>>(
      '/data/WMSLocations',
      {
        '$filter': filter,
        '$top': String(INV_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
        '$orderby': 'LocationId asc',
        '$select': 'WarehouseId,LocationId,LocationType,LocationProfileId,IsBlocked,MaxWeight,MaxVolume,dataAreaId',
      }
    );
  }

  blockLocation(
    warehouseId: string,
    locationId: string,
    dataAreaId = this.tenant.currentDataAreaId()
  ): Observable<unknown> {
    return this.api.patch(
      `/data/WMSLocations(dataAreaId='${dataAreaId}',WarehouseId='${warehouseId}',LocationId='${locationId}')`,
      { IsBlocked: true }
    );
  }

  unblockLocation(
    warehouseId: string,
    locationId: string,
    dataAreaId = this.tenant.currentDataAreaId()
  ): Observable<unknown> {
    return this.api.patch(
      `/data/WMSLocations(dataAreaId='${dataAreaId}',WarehouseId='${warehouseId}',LocationId='${locationId}')`,
      { IsBlocked: false }
    );
  }

  createLocation(payload: Partial<WarehouseLocation>): Observable<unknown> {
    return this.api.post('/data/WMSLocations', payload);
  }

  // ── AI-Enhanced On-Hand ─────────────────────────────────────────────────────
  // Uses D365's InventoryOnHandForAI entity which provides richer contextual data

  searchOnHandForAI(
    term: string,
    warehouseId?: string,
    skip = 0
  ): Observable<ODataResponse<InventoryOnHand>> {
    let filter = `contains(ItemNumber,'${term}')`;
    if (warehouseId) {
      filter += ` and InventoryWarehouseId eq '${warehouseId}'`;
    }
    return this.api.get<ODataResponse<InventoryOnHand>>(
      '/data/InventoryOnHandForAI',
      {
        '$filter': filter,
        '$top': String(INV_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
      }
    );
  }
}

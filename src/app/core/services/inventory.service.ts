import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { ApiService } from './api.service';
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
   * Substring search by number, name or description, filtered in memory over
   * a cached one-time load: this D365 environment rejects every OData string
   * function (contains/startswith → "not Queryable"), so server-side search is
   * not possible — only eq filters work.
   */
  searchProducts(term: string, limit = 50): Observable<InventoryProduct[]> {
    const lower = term.toLowerCase();
    return this.getAllProductsCached().pipe(
      map((products) =>
        products
          .filter(
            (p) =>
              p.ProductNumber.toLowerCase().includes(lower) ||
              (p.ProductName ?? '').toLowerCase().includes(lower) ||
              (p.ProductDescription ?? '').toLowerCase().includes(lower)
          )
          .slice(0, limit)
      )
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

  getAllProducts(): Observable<ODataResponse<InventoryProduct>> {
    return this.getReleased({ ...this.releasedParams(), '$orderby': 'ItemNumber asc' });
  }

  private allProducts$?: Observable<InventoryProduct[]>;
  private allProductsCompany = '';

  /**
   * Every item of the current company, loaded once and shared between
   * subscribers. Keyed by company, so switching company (or tenant) never
   * offers the previous one's items.
   */
  getAllProductsCached(): Observable<InventoryProduct[]> {
    const company = this.tenant.currentDataAreaId();
    if (!this.allProducts$ || this.allProductsCompany !== company) {
      this.allProductsCompany = company;
      this.allProducts$ = this.getAllProducts().pipe(
        map((res) => res.value),
        shareReplay(1),
        catchError((err) => {
          this.allProducts$ = undefined; // failed load isn't cached — next call retries
          return throwError(() => err);
        })
      );
    }
    return this.allProducts$;
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

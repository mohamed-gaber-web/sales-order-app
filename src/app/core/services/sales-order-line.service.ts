import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import { TenantConfigStore } from '../tenant/tenant-config.store';

// ── Lookup interfaces ──────────────────────────────────────
export interface Site {
  SiteId: string;
  SiteName: string;
}

export interface Warehouse {
  WarehouseId: string;
  WarehouseName: string;
  OperationalSiteId?: string;
}

export interface ProductVariant {
  ProductMasterNumber: string;
  ProductSizeId: string;
  ProductColorId: string;
  ProductStyleId: string;
  ProductConfigurationId: string;
}

// ── Response ───────────────────────────────────────────────
export interface SalesOrderLineResponse {
  dataAreaId: string;
  SalesOrderNumber: string;
  LineNumber?: number;
  ItemNumber: string;
  ProductName?: string;
  ShippingSiteId: string;
  ShippingWarehouseId: string;
  ProductConfigurationId: string;
  ProductSizeId: string;
  ProductColorId: string;
  ProductStyleId: string;
  OrderedSalesQuantity?: number;
  RemainingSalesPhysicalQuantity?: number;
  SalesUnitSymbol?: string;
  SalesPrice?: number;
  LineAmount?: number;
  LineDiscountAmount?: number;
  SalesTaxAmount?: number;
}

// ── DTO ────────────────────────────────────────────────────
export interface CreateSalesOrderLineDto {
  dataAreaId: string;
  SalesOrderNumber: string;
  ItemNumber: string;
  OrderedSalesQuantity: number;
  SalesPrice: number;
  ShippingSiteId: string;
  ShippingWarehouseId: string;
  ProductConfigurationId: string;
  ProductSizeId: string;
  ProductColorId: string;
  ProductStyleId: string;
}

@Injectable({ providedIn: 'root' })
export class SalesOrderLineService {
  private tenant = inject(TenantConfigStore);

  constructor(private api: ApiService) {}

  getOrderLines(
    salesOrderNumber: string
  ): Observable<ODataResponse<SalesOrderLineResponse>> {
    return this.api.get<ODataResponse<SalesOrderLineResponse>>(
      '/data/SalesOrderLines',
      {
        '$filter': `SalesOrderNumber eq '${salesOrderNumber}' and dataAreaId eq '${this.tenant.currentDataAreaId()}'`,
        '$count': 'true',
        '$orderby': 'LineCreationSequenceNumber desc',
      }
    );
  }

  createOrderLine(dto: CreateSalesOrderLineDto): Observable<unknown> {
    return this.api.post('/data/SalesOrderLines', dto);
  }

  getSites(): Observable<ODataResponse<Site>> {
    return this.api.get<ODataResponse<Site>>('/data/InventSiteBiEntities', {
      '$count': 'true',
      '$orderby': 'SiteId asc',
    });
  }

  getWarehouses(siteId?: string): Observable<ODataResponse<Warehouse>> {
    const params: Record<string, string> = {
      '$count': 'true',
      '$orderby': 'WarehouseId asc',
    };
    if (siteId) {
      params['$filter'] = `OperationalSiteId eq '${siteId}'`;
    }
    return this.api.get<ODataResponse<Warehouse>>('/data/Warehouses', params);
  }

  /**
   * Every warehouse of the company the app works in, with its site.
   *
   * `cross-company` plus a dataAreaId filter: without it D365 lists the service
   * principal's default company, which is not always the tenant's — and then
   * the warehouse the portal assigned the user (always in the tenant's company)
   * is not in the list to preselect, and the sites are another company's.
   */
  getCompanyWarehouses(): Observable<ODataResponse<Warehouse>> {
    const company = this.tenant.currentDataAreaId().replace(/'/g, "''");
    return this.api.get<ODataResponse<Warehouse>>('/data/Warehouses', {
      'cross-company': 'true',
      '$filter': `dataAreaId eq '${company}'`,
      '$orderby': 'WarehouseId asc',
    });
  }

  getProductVariants(
    productNumber: string
  ): Observable<ODataResponse<ProductVariant>> {
    return this.api.get<ODataResponse<ProductVariant>>(
      '/data/ReleasedProductVariantsV2',
      {
        '$filter': `ProductMasterNumber eq '${productNumber}'`,
        '$count': 'true',
      }
    );
  }
}

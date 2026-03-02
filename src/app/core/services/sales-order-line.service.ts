import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';

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
  ProductConfigurationId: string;
}

// ── Response ───────────────────────────────────────────────
export interface SalesOrderLineResponse {
  dataAreaId: string;
  SalesOrderNumber: string;
  ItemNumber: string;
  ProductName?: string;
  ShippingSiteId: string;
  ShippingWarehouseId: string;
  ProductConfigurationId: string;
  ProductSizeId: string;
  ProductColorId: string;
  OrderedSalesQuantity?: number;
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
  ShippingSiteId: string;
  ShippingWarehouseId: string;
  ProductConfigurationId: string;
  ProductSizeId: string;
  ProductColorId: string;
}

@Injectable({ providedIn: 'root' })
export class SalesOrderLineService {
  constructor(private api: ApiService) {}

  getOrderLines(
    salesOrderNumber: string
  ): Observable<ODataResponse<SalesOrderLineResponse>> {
    return this.api.get<ODataResponse<SalesOrderLineResponse>>(
      '/data/SalesOrderLines',
      {
        '$filter': `SalesOrderNumber eq '${salesOrderNumber}' and dataAreaId eq 'usmf'`,
        '$count': 'true',
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

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import {
  Warehouse,
  InventoryOnHand,
  InventoryProduct,
  WarehouseLocation,
} from '../../models/inventory.model';

export const INV_PAGE_SIZE = 20;

@Injectable({ providedIn: 'root' })
export class InventoryService {
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

  getProducts(skip = 0): Observable<ODataResponse<InventoryProduct>> {
    return this.api.get<ODataResponse<InventoryProduct>>(
      '/data/ProductsV2',
      {
        '$top': String(INV_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
        '$select': 'ProductNumber,ProductName,SearchName,UnitSymbol,ProductType',
        '$orderby': 'ProductNumber asc',
      }
    );
  }

  searchProducts(term: string, skip = 0): Observable<ODataResponse<InventoryProduct>> {
    const filter = `contains(ProductNumber,'${term}') or contains(ProductName,'${term}')`;
    return this.api.get<ODataResponse<InventoryProduct>>(
      '/data/ProductsV2',
      {
        '$filter': filter,
        '$top': String(INV_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
        '$select': 'ProductNumber,ProductName,SearchName,UnitSymbol,ProductType',
      }
    );
  }

  getAllProducts(): Observable<ODataResponse<InventoryProduct>> {
    return this.api.get<ODataResponse<InventoryProduct>>(
      '/data/ProductsV2',
      {
        '$count': 'true',
        '$select': 'ProductNumber,ProductName,SearchName,UnitSymbol,ProductType',
        '$orderby': 'ProductNumber asc',
      }
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
    dataAreaId = 'usmf'
  ): Observable<unknown> {
    return this.api.patch(
      `/data/WMSLocations(dataAreaId='${dataAreaId}',WarehouseId='${warehouseId}',LocationId='${locationId}')`,
      { IsBlocked: true }
    );
  }

  unblockLocation(
    warehouseId: string,
    locationId: string,
    dataAreaId = 'usmf'
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

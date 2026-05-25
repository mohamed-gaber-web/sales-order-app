import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface PIRProject {
  ProjectID: string;
  ProjectName: string;
  CustomerAccount?: string;
  DeliveryName?: string;
  ProjectStage?: string;
  ProjectType?: string;
  ProjectGroup?: string;
  StartDate1?: string;
  ActualStartDate?: string;
  ProjectContractID?: string;
  dataAreaId: string;
}

export interface PIRItemRequirement {
  ProjectId: string;
  SalesId: string;
  LineNum: number;
  ItemId: string;
  Name?: string;
  QuantityOrdered: number;
  RemainInventPhysical: number;
  SalesUnit?: string;
  SalesStatus?: string;
  ShippingSiteId?: string;
  ReceiptDateRequested?: string;
  ShippingDateRequested?: string;
  ProductConfigurationId?: string;
  ProductStyleId?: string;
  ProductSizeId?: string;
  ProductColorId?: string;
  ProjectCategoryId?: string;
  ProjectLinePropertyId?: string;
  ActivityNumber?: string;
  DeliveryName?: string;
}

export interface PickingListRequest {
  DataAreaId: string;
  SalesOrderID: string;
  packingSlipId: string;
  salesLineNum: number[];
  packingSlipQty: number[];
}

@Injectable({ providedIn: 'root' })
export class ProjectItemRequirementsService {
  private readonly DATA_AREA = 'usmf';

  constructor(private api: ApiService) {}

  getProjects(skip = 0): Observable<{ value: PIRProject[]; '@odata.count'?: number }> {
    return this.api.get('/data/Projects', {
      'cross-company': 'true',
      '$filter': `dataAreaId eq '${this.DATA_AREA}'`,
      '$select': 'ProjectID,ProjectName,CustomerAccount,DeliveryName,ProjectStage,ProjectType,ProjectGroup,StartDate1,ActualStartDate,ProjectContractID,dataAreaId',
      '$orderby': 'StartDate1 desc',
      '$top': '50',
      '$skip': String(skip),
      '$count': 'true',
    });
  }

  getAllProjects(): Observable<{ value: PIRProject[] }> {
    return this.api.get('/data/Projects', {
      'cross-company': 'true',
      '$filter': `dataAreaId eq '${this.DATA_AREA}'`,
      '$select': 'ProjectID,ProjectName,CustomerAccount,DeliveryName,ProjectStage,ProjectType,ProjectGroup,StartDate1,dataAreaId',
      '$orderby': 'StartDate1 desc',
      '$top': '500',
    });
  }

  getItemRequirements(projectId: string): Observable<{ value: PIRItemRequirement[] }> {
    return this.api.get('/data/ProjectSalesItemRequirements', {
      'cross-company': 'true',
      '$filter': `dataAreaId eq '${this.DATA_AREA}' and ProjectId eq '${projectId}'`,
      '$select': 'ProjectId,SalesId,LineNum,ItemId,Name,QuantityOrdered,RemainInventPhysical,SalesUnit,SalesStatus,ShippingSiteId,ReceiptDateRequested,ShippingDateRequested,ProductConfigurationId,ProductStyleId,ProductSizeId,ProductColorId,ProjectCategoryId,ProjectLinePropertyId,ActivityNumber,DeliveryName',
      '$orderby': 'LineNum asc',
    });
  }

  postPickingList(request: PickingListRequest): Observable<unknown> {
    return this.api.post(
      '/api/services/GP_CreatePackingSlipServiceGroup/GP_CreatePackingSlipService/postItemReqPickingList',
      { _request: request }
    );
  }
}

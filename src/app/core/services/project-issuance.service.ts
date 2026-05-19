import { Injectable } from '@angular/core';
import { Observable, of, delay } from 'rxjs';
import { ApiService } from './api.service';

export interface Project {
  ProjectID: string;
  Name: string;
  CustomerAccount?: string;
  ProjectStage: string;
  dataAreaId: string;
}

export interface ItemRequirement {
  ProjectID: string;
  LineNumber: number;
  ItemNumber: string;
  ProductName?: string;
  SalesCategory?: string;
  LinePropertyId?: string;
  RequiredQuantity: number;
  RemainingQuantity: number;
  LineStatus: string;
  RequestedReceiptDate?: string;
  dataAreaId?: string;
}

export interface PickingListPayload {
  dataAreaId: string;
  projectId: string;
  itemRequirementId: string;
  lineNumber: number;
  itemNumber: string;
  quantityToIssue: number;
  unit: string;
  site: string;
  warehouse: string;
  location?: string;
  batchNumber?: string;
  serialNumber?: string;
  postPackingSlip: boolean;
}

export interface AdHocIssuancePayload {
  dataAreaId: string;
  projectId: string;
  journalName: string;
  line: {
    itemNumber: string;
    quantity: number;
    unit: string;
    site: string;
    warehouse: string;
    location?: string;
    batchNumber?: string;
    serialNumber?: string;
    categoryId?: string;
    activityNumber?: string;
    linePropertyId?: string;
  };
}

const MOCK_PROJECTS: Project[] = [
  { ProjectID: 'MMG-000042', Name: 'Riyadh Office Building', CustomerAccount: 'RIY-CUST-001', ProjectStage: 'InProcess', dataAreaId: 'usmf' },
  { ProjectID: 'MMG-000051', Name: 'Al Jubail Plant Extension', CustomerAccount: 'JUB-CORP-002', ProjectStage: 'InProcess', dataAreaId: 'usmf' },
  { ProjectID: 'MMG-000038', Name: 'Dammam Warehouse Phase 2', CustomerAccount: 'DAM-IND-005', ProjectStage: 'InProcess', dataAreaId: 'usmf' },
  { ProjectID: 'MMG-000063', Name: 'Jeddah Commercial Tower', CustomerAccount: 'JED-COM-009', ProjectStage: 'InProcess', dataAreaId: 'usmf' },
  { ProjectID: 'MMG-000071', Name: 'Mecca Road Infrastructure', CustomerAccount: 'MEC-INFRA-003', ProjectStage: 'InProcess', dataAreaId: 'usmf' },
];

const MOCK_REQUIREMENTS: Record<string, ItemRequirement[]> = {
  'MMG-000042': [
    { ProjectID: 'MMG-000042', LineNumber: 1, ItemNumber: '400-2004-030', ProductName: 'Steel Beam 150mm', SalesCategory: 'MATERIAL', LinePropertyId: 'Billable', RequiredQuantity: 500, RemainingQuantity: 200, LineStatus: 'Open', RequestedReceiptDate: '2026-06-01' },
    { ProjectID: 'MMG-000042', LineNumber: 2, ItemNumber: '200-1001-010', ProductName: 'Electrical Cable 10mm', SalesCategory: 'MATERIAL', LinePropertyId: 'Billable', RequiredQuantity: 100, RemainingQuantity: 100, LineStatus: 'Open', RequestedReceiptDate: '2026-06-05' },
    { ProjectID: 'MMG-000042', LineNumber: 3, ItemNumber: '300-5002-020', ProductName: 'Concrete Mix B30', SalesCategory: 'MATERIAL', LinePropertyId: 'Non-Billable', RequiredQuantity: 2000, RemainingQuantity: 500, LineStatus: 'Partial', RequestedReceiptDate: '2026-05-28' },
  ],
  'MMG-000051': [
    { ProjectID: 'MMG-000051', LineNumber: 1, ItemNumber: '100-3001-005', ProductName: 'Structural Pipe 50mm', SalesCategory: 'MATERIAL', LinePropertyId: 'Billable', RequiredQuantity: 300, RemainingQuantity: 300, LineStatus: 'Open', RequestedReceiptDate: '2026-06-10' },
    { ProjectID: 'MMG-000051', LineNumber: 2, ItemNumber: '500-4003-015', ProductName: 'Insulation Panel 75mm', SalesCategory: 'MATERIAL', LinePropertyId: 'Billable', RequiredQuantity: 150, RemainingQuantity: 75, LineStatus: 'Partial', RequestedReceiptDate: '2026-06-08' },
  ],
  'MMG-000038': [
    { ProjectID: 'MMG-000038', LineNumber: 1, ItemNumber: '600-2001-001', ProductName: 'Roofing Sheet Galv', SalesCategory: 'MATERIAL', LinePropertyId: 'Billable', RequiredQuantity: 800, RemainingQuantity: 800, LineStatus: 'Open', RequestedReceiptDate: '2026-06-15' },
  ],
  'MMG-000063': [],
  'MMG-000071': [
    { ProjectID: 'MMG-000071', LineNumber: 1, ItemNumber: '700-1005-008', ProductName: 'Asphalt Mix Type A', SalesCategory: 'MATERIAL', LinePropertyId: 'Billable', RequiredQuantity: 5000, RemainingQuantity: 2500, LineStatus: 'Partial', RequestedReceiptDate: '2026-05-30' },
  ],
};

@Injectable({ providedIn: 'root' })
export class ProjectIssuanceService {
  constructor(private api: ApiService) {}

  getProjects(skip = 0, dataAreaId = 'usmf'): Observable<{ value: Project[]; '@odata.count': number }> {
    // TODO: replace with real API call when available:
    // return this.api.get('/data/Projects', {
    //   '$filter': `dataAreaId eq '${dataAreaId}' and ProjectStage eq Microsoft.Dynamics.DataEntities.ProjStatus'InProcess'`,
    //   '$select': 'ProjectID,Name,CustomerAccount,ProjectStage,dataAreaId',
    //   '$top': '10', '$skip': String(skip), '$count': 'true',
    //   '$orderby': 'ProjectID desc',
    // });
    const page = MOCK_PROJECTS.slice(skip, skip + 10);
    return of({ value: page, '@odata.count': MOCK_PROJECTS.length }).pipe(delay(600));
  }

  getAllProjects(dataAreaId = 'usmf'): Observable<{ value: Project[] }> {
    return of({ value: MOCK_PROJECTS }).pipe(delay(400));
  }

  getItemRequirements(projectId: string, dataAreaId = 'usmf'): Observable<{ value: ItemRequirement[] }> {
    // TODO: replace with real API call:
    // return this.api.get('/data/ProjectItemRequirements', {
    //   '$filter': `dataAreaId eq '${dataAreaId}' and ProjectID eq '${projectId}' and RemainingQuantity gt 0`,
    //   '$orderby': 'LineNumber asc',
    // });
    const lines = MOCK_REQUIREMENTS[projectId] ?? [];
    return of({ value: lines }).pipe(delay(500));
  }

  postPickingList(payload: PickingListPayload): Observable<{ success: boolean; message?: string }> {
    // TODO: replace with real BFF call:
    // return this.api.post(`/api/projects/${payload.projectId}/itemrequirements/${payload.itemRequirementId}/picking-list`, payload);
    return of({ success: true }).pipe(delay(1500));
  }

  postAdHocIssuance(payload: AdHocIssuancePayload): Observable<{ success: boolean; message?: string }> {
    // TODO: replace with real BFF call:
    // return this.api.post(`/api/projects/${payload.projectId}/item-journal/post`, payload);
    return of({ success: true }).pipe(delay(1500));
  }
}

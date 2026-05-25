import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface PIJJournalTable {
  dataAreaId: string;
  JournalId: string;
  JournalName: string;
  Description: string;
  PostingDetailLevel: string;
  Posted: string;
}

export interface PIJJournalTrans {
  dataAreaId: string;
  JournalId: string;
  LineNum?: number;
  ProjectId: string;
  ItemId: string;
  Quantity: number;
  PriceUnit: number;
  ProjectCategoryId: string;
  ProjectLinePropertyId: string;
  ProjectSalesCurrencyId: string;
  ProjectDate: string;
  StorageSiteId: string;
  StorageWarehouseId: string;
  ActivityNumber?: string;
  ProjectUnitID?: string;
  CostAmount?: number;
  ProductConfigurationId?: string;
  ProductSizeId?: string;
  ProductColorId?: string;
  ProductStyleId?: string;
  ProductVersionId?: string;
  inventSerialId?: string;
}

export interface PIJProject {
  ProjectID: string;
  Name?: string;
  dataAreaId?: string;
}

export interface PIJLineProperty {
  LinePropertyId: string;
  dataAreaId?: string;
}

export interface PIJCategory {
  Category: string;
  TransactionType?: string;
  dataAreaId?: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectItemJournalService {
  private readonly DATA_AREA = 'usmf';

  constructor(private api: ApiService) {}

  getJournals(): Observable<{ value: PIJJournalTable[] }> {
    // Posted filter is applied client-side — D365 NoYes enum rejects string comparison server-side
    return this.api.get('/data/ProjectItemJournalTables', {
      'cross-company': 'true',
      '$filter': `dataAreaId eq '${this.DATA_AREA}'`,
      '$orderby': 'JournalId desc',
    });
  }

  createJournal(body: Partial<PIJJournalTable>): Observable<PIJJournalTable> {
    return this.api.post('/data/ProjectItemJournalTables', body);
  }

  getLines(journalId: string): Observable<{ value: PIJJournalTrans[] }> {
    return this.api.get('/data/ProjectItemJournalTrans', {
      'cross-company': 'true',
      '$filter': `dataAreaId eq '${this.DATA_AREA}' and JournalId eq '${journalId}'`,
      '$orderby': 'LineNum asc',
    });
  }

  createLine(body: Partial<PIJJournalTrans>): Observable<PIJJournalTrans> {
    return this.api.post('/data/ProjectItemJournalTrans', body);
  }

  getProjects(): Observable<{ value: PIJProject[] }> {
    return this.api.get('/data/Projects', {
      'cross-company': 'true',
      '$filter': `dataAreaId eq '${this.DATA_AREA}'`,
      '$select': 'ProjectID,Name,dataAreaId',
      '$top': '500',
      '$orderby': 'ProjectID asc',
    });
  }

  getLineProperties(): Observable<{ value: PIJLineProperty[] }> {
    return this.api.get('/data/ProjectLineProperties', {
      'cross-company': 'true',
      '$filter': `dataAreaId eq '${this.DATA_AREA}'`,
    });
  }

  getCategories(): Observable<{ value: PIJCategory[] }> {
    return this.api.get('/data/ProjectCategoryEntities', {
      'cross-company': 'true',
      '$filter': `dataAreaId eq '${this.DATA_AREA}' and TransactionType eq 'Item'`,
    });
  }

  generateJournalId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    const suffix = Array.from(arr).map(b => chars[b % chars.length]).join('');
    return `PIJ-${suffix}`;
  }

  getLastUsedSite(): string {
    return localStorage.getItem('pij_last_site') ?? '';
  }

  getLastUsedWarehouse(): string {
    return localStorage.getItem('pij_last_warehouse') ?? '';
  }

  saveLastUsed(site: string, warehouse: string): void {
    localStorage.setItem('pij_last_site', site);
    localStorage.setItem('pij_last_warehouse', warehouse);
  }
}

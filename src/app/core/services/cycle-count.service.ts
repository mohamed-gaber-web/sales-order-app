import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import { CycleCountJournalHeader, CycleCountJournalLine } from '../../models/inventory.model';

@Injectable({ providedIn: 'root' })
export class CycleCountService {
  private readonly dataAreaId = 'usmf';

  constructor(private api: ApiService) {}

  getJournalHeaders(): Observable<ODataResponse<CycleCountJournalHeader>> {
    return this.api.get<ODataResponse<CycleCountJournalHeader>>(
      '/data/InventoryCountingJournalHeaders',
      {
        'cross-company': 'true',
        '$filter': `dataAreaId eq '${this.dataAreaId}' and IsPosted eq Microsoft.Dynamics.DataEntities.NoYes'No'`,
        '$orderby': 'JournalNumber desc',
        '$count': 'true',
      }
    );
  }

  getJournalLines(journalNumber: string): Observable<ODataResponse<CycleCountJournalLine>> {
    return this.api.get<ODataResponse<CycleCountJournalLine>>(
      '/data/InventoryCountingJournalLines',
      {
        'cross-company': 'true',
        '$filter': `dataAreaId eq '${this.dataAreaId}' and JournalNumber eq '${journalNumber}'`,
        '$orderby': 'LineNumber asc',
        '$count': 'true',
      }
    );
  }

  updateCountedQuantity(
    dataAreaId: string,
    journalNumber: string,
    lineNumber: number,
    countedQty: number
  ): Observable<void> {
    const path = `/data/InventoryCountingJournalLines(dataAreaId='${dataAreaId}',JournalNumber='${journalNumber}',LineNumber=${lineNumber})?cross-company=true`;
    return this.api.patchWithHeaders<void>(
      path,
      { CountedQuantity: countedQty },
      { 'If-Match': '*' }
    );
  }

  createJournal(body: Partial<CycleCountJournalHeader>): Observable<CycleCountJournalHeader> {
    return this.api.post<CycleCountJournalHeader>('/data/InventoryCountingJournalHeaders', body);
  }

  createJournalLine(body: Partial<CycleCountJournalLine>): Observable<CycleCountJournalLine> {
    return this.api.post<CycleCountJournalLine>('/data/InventoryCountingJournalLines', body);
  }

  generateJournalNumber(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    const suffix = Array.from(arr).map(b => chars[b % chars.length]).join('');
    return `CC-${suffix}`;
  }

  getLastUsedSite(): string {
    return localStorage.getItem('cc_last_site') ?? '';
  }

  getLastUsedWarehouse(): string {
    return localStorage.getItem('cc_last_warehouse') ?? '';
  }

  saveLastUsed(site: string, warehouse: string): void {
    localStorage.setItem('cc_last_site', site);
    localStorage.setItem('cc_last_warehouse', warehouse);
  }
}

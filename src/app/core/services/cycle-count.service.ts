import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import { CycleCountJournalHeader, CycleCountJournalLine } from '../../models/inventory.model';

/**
 * The counting journal name configured in D365 (Inventory management > Setup >
 * Journal names > Counting). Single source of truth — a count created under any other
 * name is rejected on posting.
 */
export const CYCLE_COUNT_JOURNAL_NAME = 'ICnt';

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

  /**
   * Header and lines must be posted separately: D365 refuses a deep insert here with
   * "Cannot apply PATCH to navigation property 'InventoryCountingJournalLine'", so the
   * nested form is not an option no matter how the payload is shaped.
   *
   * JournalNumber is deliberately not sent — the field rejects edits and only accepts
   * the number sequence's own `#####` format, so D365 assigns it and returns it on the
   * created entity for the lines to reference.
   */
  createJournal(header: Partial<CycleCountJournalHeader>): Observable<CycleCountJournalHeader> {
    return this.api.post<CycleCountJournalHeader>(
      '/data/InventoryCountingJournalHeaders?cross-company=true',
      header
    );
  }

  createJournalLine(line: Partial<CycleCountJournalLine>): Observable<CycleCountJournalLine> {
    return this.api.post<CycleCountJournalLine>(
      '/data/InventoryCountingJournalLines?cross-company=true',
      line
    );
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

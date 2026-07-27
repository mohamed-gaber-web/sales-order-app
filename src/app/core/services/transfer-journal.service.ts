import { Injectable, inject } from '@angular/core';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, concatMap, map, toArray } from 'rxjs/operators';
import { ApiService } from './api.service';
import { InventoryService } from './inventory.service';
import { ODataResponse } from '../models/lookup.models';
import { InventoryProduct, WarehouseLocation } from '../../models/inventory.model';
import {
  TransferJournalHeaderEntity,
  TransferJournalLineEntity,
  TransferJournalRequest,
  TransferJournalResult,
} from '../../models/transfer-journal.model';

/** Company every transfer journal is created in. Single place to change for another legal entity. */
export const TRANSFER_JOURNAL_DATA_AREA_ID = 'usmf';

/**
 * The transfer journal name configured in D365 (Inventory management > Setup >
 * Journal names > Inventory). A journal created under any other name is rejected
 * on posting.
 */
export const TRANSFER_JOURNAL_NAME_ID = 'ITrf';

const HEADER_ENTITY = '/data/InventoryTransferJournalHeaders';
const LINE_ENTITY = '/data/InventoryTransferJournalEntries';
const JOURNAL_POOL_ENTITY = '/data/InventoryJournalTableBiEntities';
// `WMSLocations` is not exposed on this environment (404) — `WarehouseLocations` is,
// and names the column `WarehouseLocationId` rather than `LocationId`.
const LOCATION_ENTITY = '/data/WarehouseLocations';

// Journal numbers are shared across every inventory journal type in a company, so the
// pool is read whole and the highest number taken. Comfortably above the ~44 open
// journals a company carries, and $select keeps the payload small.
const JOURNAL_POOL_SIZE = 500;

// A number claimed between reading the pool and writing the header fails the insert.
// Retrying with the next number costs one round trip and is far likelier to succeed
// than to collide twice.
const JOURNAL_NUMBER_ATTEMPTS = 5;

interface JournalPoolRow {
  JournalId: string;
}

interface WarehouseLocationRow {
  dataAreaId?: string;
  WarehouseId: string;
  WarehouseLocationId: string;
}

@Injectable({ providedIn: 'root' })
export class TransferJournalService {
  private api = inject(ApiService);
  private inventory = inject(InventoryService);

  /** Locations belonging to a warehouse, for the From/To pickers. */
  getLocations(warehouseId: string): Observable<WarehouseLocation[]> {
    const safe = warehouseId.replace(/'/g, "''");
    return this.api.get<ODataResponse<WarehouseLocationRow>>(LOCATION_ENTITY, {
      'cross-company': 'true',
      '$filter': `dataAreaId eq '${TRANSFER_JOURNAL_DATA_AREA_ID}' and WarehouseId eq '${safe}'`,
      '$select': 'dataAreaId,WarehouseId,WarehouseLocationId',
      '$orderby': 'WarehouseLocationId asc',
      '$top': '500',
    }).pipe(
      map((res) => (res.value ?? []).map((row) => ({
        WarehouseId: row.WarehouseId,
        LocationId: row.WarehouseLocationId,
        dataAreaId: row.dataAreaId,
      })))
    );
  }

  /** Product search over ProductsV2, matched in memory against the cached catalogue. */
  searchProducts(term: string, limit = 50): Observable<InventoryProduct[]> {
    return this.inventory.searchProducts(term, limit);
  }

  /** Exact item-number lookup, for a scan that has to resolve to one product. */
  getProductByNumber(productNumber: string): Observable<InventoryProduct | undefined> {
    return this.inventory
      .getProductByNumber(productNumber)
      .pipe(map((res) => res.value?.[0]));
  }

  /**
   * Creates the journal and adds a line per scanned item. The journal is left unposted
   * for review in D365 — posting is deliberately not done from the app.
   *
   * Header and lines are separate calls because D365 refuses a deep insert of lines
   * under the header ("Cannot apply PATCH to navigation property"). A failure part-way
   * through is reported with the journal number so the rest can be finished in D365
   * rather than silently repeated here.
   */
  createTransferJournal(request: TransferJournalRequest): Observable<TransferJournalResult> {
    return this.createHeader().pipe(
      concatMap((journalNumber) =>
        this.createLines(journalNumber, request).pipe(
          map(() => ({ success: true, journalNumber })),
          catchError((err) =>
            of({
              success: false,
              journalNumber,
              errorMessage:
                `Journal ${journalNumber} was created but its lines are incomplete. ` +
                this.extractError(err),
            })
          )
        )
      ),
      catchError((err) =>
        of({
          success: false,
          journalNumber: '',
          errorMessage: this.extractError(err),
        })
      )
    );
  }

  /** Creates the header, stepping to the next number if the one read was taken meanwhile. */
  private createHeader(attempt = 0): Observable<string> {
    return this.nextJournalNumber(attempt).pipe(
      concatMap((journalNumber) => {
        const header: TransferJournalHeaderEntity = {
          dataAreaId: TRANSFER_JOURNAL_DATA_AREA_ID,
          JournalNumber: journalNumber,
          JournalNameId: TRANSFER_JOURNAL_NAME_ID,
          Description: 'Mobile transfer journal',
        };
        return this.api
          .post<TransferJournalHeaderEntity>(`${HEADER_ENTITY}?cross-company=true`, header)
          .pipe(
            map((created) => created?.JournalNumber || journalNumber),
            catchError((err) =>
              attempt + 1 < JOURNAL_NUMBER_ATTEMPTS
                ? this.createHeader(attempt + 1)
                : throwError(() => err)
            )
          );
      })
    );
  }

  /**
   * The header entity requires JournalNumber — unlike the counting journal it does not
   * draw one from the number sequence — so the next number is worked out from the
   * company's journal pool, which every inventory journal type shares.
   */
  private nextJournalNumber(offset: number): Observable<string> {
    return this.api.get<ODataResponse<JournalPoolRow>>(JOURNAL_POOL_ENTITY, {
      'cross-company': 'true',
      '$filter': `dataAreaId eq '${TRANSFER_JOURNAL_DATA_AREA_ID}'`,
      '$select': 'JournalId',
      '$orderby': 'JournalId desc',
      '$top': String(JOURNAL_POOL_SIZE),
    }).pipe(
      map((res) => {
        // Project journals use their own prefixed ids (PIJ-…) and share the pool; only
        // the plain numeric ones say where the number sequence has reached.
        const numbers = (res.value ?? [])
          .map((row) => row.JournalId)
          .filter((id) => /^\d+$/.test(id))
          .map((id) => Number(id));
        const highest = numbers.length > 0 ? Math.max(...numbers) : 0;
        const next = highest + 1 + offset;
        return String(next).padStart(5, '0');
      })
    );
  }

  /** Lines go in one at a time — D365 rejects concurrent writes into the same journal. */
  private createLines(journalNumber: string, request: TransferJournalRequest): Observable<void> {
    const transactionDate = this.toJournalDate(new Date());
    const { route } = request;

    return from(request.items.map((item, index) => ({ item, lineNumber: index + 1 }))).pipe(
      concatMap(({ item, lineNumber }) => {
        const line: TransferJournalLineEntity = {
          dataAreaId: TRANSFER_JOURNAL_DATA_AREA_ID,
          JournalNumber: journalNumber,
          LineNumber: lineNumber,
          ItemNumber: item.itemNumber,
          InventoryQuantity: item.qty,
          TransactionDate: transactionDate,
          SourceInventorySiteId: route.fromSiteId,
          SourceWarehouseId: route.fromWarehouseId,
          SourceWarehouseLocationId: route.fromLocationId,
          DestinationInventorySiteId: route.toSiteId,
          DestinationWarehouseId: route.toWarehouseId,
          DestinationWarehouseLocationId: route.toLocationId,
        };
        return this.api.post<TransferJournalLineEntity>(`${LINE_ENTITY}?cross-company=true`, line);
      }),
      toArray(),
      map(() => undefined)
    );
  }

  /** D365 date fields land on midday UTC so a timezone shift can't move them a day. */
  private toJournalDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T12:00:00Z`;
  }

  private extractError(err: unknown): string {
    const e = err as {
      error?: { error?: { message?: string; innererror?: { message?: string } }; Message?: string; message?: string };
      message?: string;
    };
    return (
      e?.error?.error?.innererror?.message ||
      e?.error?.error?.message ||
      e?.error?.Message ||
      e?.error?.message ||
      e?.message ||
      'D365 did not accept the transfer.'
    );
  }
}

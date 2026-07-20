import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import { ProductionPickingJournal, ProductionPickingListEntry } from '../../models/inventory.model';

type PickingJournalSummaryRow = Pick<
  ProductionPickingListEntry,
  'dataAreaId' | 'JournalNumber' | 'JournalName' | 'JournalDescription' | 'IsPosted' | 'PostedDateTime' | 'ProductionOrderNumber'
>;

const ENTITY = '/data/ProductionPickingListJournalEntries';

@Injectable({ providedIn: 'root' })
export class ProductionPickingListService {
  private api = inject(ApiService);

  getJournals(): Observable<ProductionPickingJournal[]> {
    return this.api.get<ODataResponse<PickingJournalSummaryRow>>(
      ENTITY,
      {
        '$select': 'dataAreaId,JournalNumber,JournalName,JournalDescription,IsPosted,PostedDateTime,ProductionOrderNumber',
        '$orderby': 'JournalNumber desc',
      }
    ).pipe(map(res => this.groupByJournal(res.value)));
  }

  getJournalLines(journalNumber: string): Observable<ProductionPickingListEntry[]> {
    const escaped = journalNumber.replace(/'/g, "''");
    return this.api.get<ODataResponse<ProductionPickingListEntry>>(
      ENTITY,
      {
        '$filter': `JournalNumber eq '${escaped}'`,
        '$select': 'dataAreaId,JournalNumber,JournalLineNumber,JournalName,JournalDescription,IsPosted,PostedDateTime,' +
                   'ConsumptionDate,ItemNumber,ProductionOrderNumber,ProposalBOMQuantity,ConsumptionBOMQuantity,' +
                   'ScrapBOMQuantity,BOMUnitSymbol,WarehouseId,WarehouseLocationId,ProductionSiteId,OperationNumber,' +
                   'ItemBatchNumber,ItemSerialNumber',
        '$orderby': 'JournalLineNumber asc',
      }
    ).pipe(map(res => res.value));
  }

  private groupByJournal(rows: PickingJournalSummaryRow[]): ProductionPickingJournal[] {
    const journals = new Map<string, ProductionPickingJournal>();
    for (const row of rows) {
      const existing = journals.get(row.JournalNumber);
      if (existing) {
        existing.LineCount++;
      } else {
        journals.set(row.JournalNumber, {
          JournalNumber: row.JournalNumber,
          JournalName: row.JournalName,
          JournalDescription: row.JournalDescription,
          IsPosted: row.IsPosted,
          PostedDateTime: row.PostedDateTime,
          ProductionOrderNumber: row.ProductionOrderNumber,
          LineCount: 1,
          dataAreaId: row.dataAreaId,
        });
      }
    }
    return [...journals.values()];
  }
}

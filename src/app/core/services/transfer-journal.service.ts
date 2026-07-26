import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { ApiService } from './api.service';
import { WarehouseLocation } from '../../models/inventory.model';
import {
  TransferJournalConfirmPayload,
  TransferJournalConfirmResponse,
} from '../../models/transfer-journal.model';

const SAMPLE_LOCATION_IDS = ['BULK-01', 'BULK-02', 'DOCK-A', 'DOCK-B', 'STAGE-01', 'PICK-A-01', 'PICK-A-02'];

@Injectable({ providedIn: 'root' })
export class TransferJournalService {
  private api = inject(ApiService);

  /**
   * STUB — no location API exists yet. Returns sample data shaped as
   * WarehouseLocation (the same model InventoryService.getLocations() already
   * uses against /data/WMSLocations), so swapping this body for a real call
   * later is a drop-in change with no impact on callers.
   */
  getLocations(warehouseId: string): Observable<WarehouseLocation[]> {
    console.warn('TransferJournalService.getLocations: mock data — backend API not yet wired');
    const sample: WarehouseLocation[] = SAMPLE_LOCATION_IDS.map((id) => ({
      WarehouseId: warehouseId,
      LocationId: id,
      dataAreaId: 'usmf',
    }));
    return of(sample).pipe(delay(300));
  }

  // Stub: transfer journal confirm posting when D365 API is available
  confirmTransfer(payload: TransferJournalConfirmPayload): Observable<TransferJournalConfirmResponse> {
    console.warn('TransferJournalService.confirmTransfer: backend API not yet wired');
    return this.api.post<TransferJournalConfirmResponse>(
      '/api/services/GP_transferJournalServiceGroup/GP_TransferJournalService/confirmTransfer',
      payload
    );
  }
}

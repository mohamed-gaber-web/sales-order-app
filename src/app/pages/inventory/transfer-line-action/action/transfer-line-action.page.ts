import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LoadingController, ModalController, ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { from, of } from 'rxjs';
import { catchError, concatMap, map, toArray } from 'rxjs/operators';
import { TransferShipmentService } from '../../../../core/services/transfer-shipment.service';
import { TenantConfigStore } from '../../../../core/tenant/tenant-config.store';
import { TransferOrderHeader, TransferOrderLine } from '../../../../models/transfer-order.model';
import { TransferLineAction } from '../../../../models/inventory.model';
import { TRANSFER_LINE_ACTIONS, TransferLineActionConfig, remainingQty } from '../transfer-line-action.config';
import {
  TransferLineDialogComponent,
  TransferLineInput,
  TransferLineResult,
} from '../line-dialog/transfer-line-dialog.component';

interface LineEntry {
  line: TransferOrderLine;
  /** Bound to ion-input, which hands back a string; read it through qtyOf(). */
  qty: number | string;
  remainQty: number;
}

// An empty box counts as 0, i.e. skip the line.
function qtyOf(entry: LineEntry): number {
  return entry.qty === '' ? 0 : Number(entry.qty);
}

interface LineResult {
  lineNum: number;
  ok: boolean;
  message?: string;
}

@Component({
  selector: 'app-transfer-line-action',
  templateUrl: './transfer-line-action.page.html',
  // Same screen as Transfer Receive, so the same styles.
  styleUrls: ['../../transfer-receive/action/transfer-receive-action.page.scss'],
  standalone: false,
})
export class TransferLineActionPage implements OnInit {
  private route = inject(ActivatedRoute);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private modalCtrl = inject(ModalController);
  private translate = inject(TranslateService);
  private transferShipmentService = inject(TransferShipmentService);

  readonly config: TransferLineActionConfig = TRANSFER_LINE_ACTIONS[
    this.route.snapshot.data['action'] as TransferLineAction
  ];

  toNumber = '';
  // The tenant's company; the loaded header's own dataAreaId replaces it.
  dataAreaId = inject(TenantConfigStore).currentDataAreaId();
  header: TransferOrderHeader | null = null;
  lineEntries: LineEntry[] = [];

  isLoading = false;
  isSubmitting = false;
  loadError = false;

  get listUrl(): string {
    return `/inventory/${this.config.path}`;
  }

  ngOnInit() {
    this.toNumber = this.route.snapshot.paramMap.get('toNumber') ?? '';
    this.loadOrderWithLines();
  }

  loadOrderWithLines() {
    this.isLoading = true;
    this.loadError = false;
    this.lineEntries = [];
    this.header = null;

    this.transferShipmentService.getOrderWithLines(this.toNumber, this.dataAreaId).subscribe({
      next: ({ header, lines }) => {
        this.header = header;
        this.dataAreaId = header.dataAreaId ?? this.dataAreaId;
        // Every line, as on the Transfer Order screen. The quantity starts at what
        // is left on this action's side; a line with nothing left starts at 0 (skipped).
        this.lineEntries = lines.map(line => {
          const remainQty = remainingQty(line, this.config.side);
          return { line, remainQty, qty: remainQty };
        });
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.loadError = true;
      },
    });
  }

  setMaxQty(entry: LineEntry) {
    entry.qty = entry.remainQty;
  }

  isQtyValid(entry: LineEntry): boolean {
    const qty = qtyOf(entry);
    // No upper cap: D365 owns the rule for how much may be reserved, picked or registered.
    return !Number.isNaN(qty) && qty >= 0;
  }

  // A line set to 0 is skipped, so the operator can act on just some lines.
  get isFormValid(): boolean {
    return (
      this.lineEntries.every(e => this.isQtyValid(e)) &&
      this.lineEntries.some(e => qtyOf(e) > 0)
    );
  }

  async submit() {
    if (!this.isFormValid || this.isSubmitting) return;
    // Claimed before any await, so a double tap can't open two dialogs or send twice.
    this.isSubmitting = true;

    // Every action also says where the stock is: location, batch, serial, license plate.
    const lines: TransferLineInput[] = this.lineEntries
      .filter(e => qtyOf(e) > 0)
      .map(e => ({
        lineNum: e.line.LineNumber,
        itemNumber: e.line.ItemNumber,
        unitId: e.line.UnitId,
        qty: qtyOf(e),
        remainQty: e.remainQty,
      }));
    const modal = await this.modalCtrl.create({
      component: TransferLineDialogComponent,
      componentProps: {
        action: this.config.action,
        orderNumber: this.toNumber,
        lines,
        warehouseId: this.config.side === 'ship' ? this.header?.ShippingWarehouseId : this.header?.ReceivingWarehouseId,
      },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<TransferLineResult[]>();
    if (role === 'confirm' && data?.length) this.runLines(data);
    else this.isSubmitting = false;
  }

  // D365 takes one line per call: send them in order, and keep going past a
  // failed line so the operator sees every line that needs attention at once.
  // The caller has already set isSubmitting.
  private async runLines(picks: TransferLineResult[]) {
    const action = this.config.action;
    const loading = await this.loadingCtrl.create({
      message: this.translate.instant(`transferLine.${action}.running`),
      spinner: 'crescent',
    });
    await loading.present();
    this.isSubmitting = true;

    from(picks).pipe(
      concatMap(pick =>
        this.transferShipmentService.transferLineAction(action, {
          _request: {
            DataAreaId: this.dataAreaId.toUpperCase(),
            OrderId: this.toNumber,
            LineNum: pick.lineNum,
            Qty: pick.qty,
            InventSiteId: pick.inventSiteId,
            InventLocationId: pick.inventLocationId,
            WMSLocationId: pick.wmsLocationId,
            InventBatchId: pick.inventBatchId,
            InventSerialId: pick.inventSerialId,
            LicensePlateId: pick.licensePlateId,
          },
        }).pipe(
          map((res): LineResult => ({
            lineNum: pick.lineNum,
            ok: res.Success,
            message: res.ErrorMessage || res.DebugMessage,
          })),
          catchError((err: unknown) => {
            const e = err as { error?: { Message?: string; message?: string }; message?: string };
            return of<LineResult>({
              lineNum: pick.lineNum,
              ok: false,
              message: e?.error?.Message ?? e?.error?.message ?? e?.message,
            });
          }),
        ),
      ),
      toArray(),
    ).subscribe(async results => {
      await loading.dismiss();
      this.isSubmitting = false;

      const label = this.translate.instant(`transferLine.${action}.label`);
      const failed = results.filter(r => !r.ok);
      const message = failed.length === 0
        ? this.translate.instant('transferLine.allDone', { action: label, count: results.length })
        : this.translate.instant('transferLine.someFailed', {
            action: label,
            failed: failed.length,
            count: results.length,
            details: failed
              .map(f => `${this.translate.instant('transferLine.line')} ${f.lineNum}: ${f.message || '—'}`)
              .join('\n'),
          });

      const toast = await this.toastCtrl.create({
        message,
        buttons: [{ text: this.translate.instant('common.dismiss'), role: 'cancel' }],
        color: failed.length === 0 ? 'success' : 'danger',
        position: 'bottom',
        duration: failed.length === 0 ? 3000 : 0,
      });
      await toast.present();

      // Quantities change in D365 after a successful call; show what is left.
      if (failed.length < results.length) this.loadOrderWithLines();
    });
  }
}

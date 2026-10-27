import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { from, of } from 'rxjs';
import { catchError, concatMap, map, toArray } from 'rxjs/operators';
import { SalesOrderService } from '../../../../core/services/sales-order.service';
import { SalesOrderLineResponse, SalesOrderLineService } from '../../../../core/services/sales-order-line.service';
import { TenantConfigStore } from '../../../../core/tenant/tenant-config.store';
import { SalesLineAction, SalesLineDimensions } from '../../../../models/sales-order.model';
import {
  DIMENSION_FIELDS,
  SALES_LINE_ACTIONS,
  SalesLineActionConfig,
  buildSalesLineRequest,
  initialQty,
  lineDimensions,
  remainingQty,
} from '../sales-line-action.config';

interface LineEntry {
  line: SalesOrderLineResponse;
  lineNum: number;
  remainQty: number;
  /** Bound to ion-input, which hands back a string; read it through qtyOf(). */
  qty: number | string;
  /** Cancel remainder only: whether this line is included. */
  selected: boolean;
  dims: SalesLineDimensions;
}

interface LineResult {
  lineNum: number;
  ok: boolean;
  message?: string;
}

// An empty box counts as 0, i.e. skip the line.
function qtyOf(entry: LineEntry): number {
  return entry.qty === '' ? 0 : Number(entry.qty);
}

@Component({
  selector: 'app-sales-line-action',
  templateUrl: './sales-line-action.page.html',
  // Same line layout as the transfer line actions, plus the dimension grid.
  styleUrls: [
    '../../../inventory/transfer-receive/action/transfer-receive-action.page.scss',
    './sales-line-action.page.scss',
  ],
  standalone: false,
})
export class SalesLineActionPage implements OnInit {
  private route = inject(ActivatedRoute);
  private alertCtrl = inject(AlertController);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private translate = inject(TranslateService);
  private salesOrderService = inject(SalesOrderService);
  private orderLineService = inject(SalesOrderLineService);
  private tenantDataAreaId = inject(TenantConfigStore).currentDataAreaId();

  readonly config: SalesLineActionConfig = SALES_LINE_ACTIONS[
    this.route.snapshot.data['action'] as SalesLineAction
  ];
  readonly dimensionFields = DIMENSION_FIELDS;

  salesId = '';
  lineEntries: LineEntry[] = [];
  isLoading = false;
  isSubmitting = false;
  loadError = false;

  get listUrl(): string {
    return `/sales-order/${this.config.path}`;
  }

  ngOnInit() {
    this.salesId = this.route.snapshot.paramMap.get('salesId') ?? '';
    this.loadLines();
  }

  /**
   * @param keep entries whose input should survive the reload: the lines that
   *   just failed, so the operator can correct them instead of retyping.
   */
  loadLines(keep: LineEntry[] = []) {
    this.isLoading = true;
    this.loadError = false;
    this.lineEntries = [];
    const kept = new Map(keep.map(e => [e.lineNum, e]));

    this.orderLineService.getOrderLines(this.salesId).subscribe({
      next: res => {
        this.lineEntries = res.value
          // Without a LineNumber there is no safe way to address the line in D365:
          // the list is ordered by creation sequence, so a position is not a line number.
          .filter((line): line is SalesOrderLineResponse & { LineNumber: number } => line.LineNumber != null)
          .map(line => {
            const prev = kept.get(line.LineNumber);
            return {
              line,
              lineNum: line.LineNumber,
              remainQty: remainingQty(line),
              qty: prev?.qty ?? initialQty(this.config, line),
              selected: prev?.selected ?? false,
              dims: prev ? { ...prev.dims } : lineDimensions(line),
            };
          })
          .sort((a, b) => a.lineNum - b.lineNum);
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
    // No upper cap: D365 owns the rule for how much each operation allows.
    return !Number.isNaN(qty) && qty >= 0;
  }

  private isIncluded(entry: LineEntry): boolean {
    return this.config.input === 'none' ? entry.selected : qtyOf(entry) > 0;
  }

  get includedCount(): number {
    return this.lineEntries.filter(e => this.isIncluded(e)).length;
  }

  get isFormValid(): boolean {
    const qtyOk = this.config.input === 'none' || this.lineEntries.every(e => this.isQtyValid(e));
    return qtyOk && this.includedCount > 0;
  }

  async submit() {
    if (!this.isFormValid || this.isSubmitting) return;
    // Claimed before any await: a double tap must not send every line twice.
    this.isSubmitting = true;

    const label = this.translate.instant(`salesLine.${this.config.action}.label`);
    if (this.config.destructive) {
      const alert = await this.alertCtrl.create({
        header: label,
        message: this.translate.instant('salesLine.confirmCancel', { count: this.includedCount, order: this.salesId }),
        buttons: [
          { text: this.translate.instant('common.cancel'), role: 'cancel' },
          { text: label, role: 'destructive' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'destructive') {
        this.isSubmitting = false;
        return;
      }
    }
    this.send(label);
  }

  // D365 takes one line per call: send them in order, and keep going past a
  // failed line so the operator sees every line that needs attention at once.
  private async send(label: string) {
    const action = this.config.action;
    const loading = await this.loadingCtrl.create({
      message: this.translate.instant(`salesLine.${action}.running`),
      spinner: 'crescent',
    });
    await loading.present();

    from(this.lineEntries.filter(e => this.isIncluded(e))).pipe(
      concatMap(entry =>
        this.salesOrderService.salesLineAction(action, buildSalesLineRequest(action, {
          dataAreaId: entry.line.dataAreaId || this.tenantDataAreaId,
          orderId: this.salesId,
          lineNum: entry.lineNum,
          qty: qtyOf(entry),
          dims: entry.dims,
        })).pipe(
          map((res): LineResult => ({
            lineNum: entry.lineNum,
            ok: res.Success,
            message: res.ErrorMessage || res.DebugMessage,
          })),
          catchError((err: unknown) => {
            const e = err as { error?: { Message?: string; message?: string }; message?: string };
            return of<LineResult>({
              lineNum: entry.lineNum,
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

      // Quantities change in D365 after a successful call; show what is left,
      // keeping what the operator typed on the lines that failed.
      if (failed.length < results.length) {
        const failedNums = new Set(failed.map(f => f.lineNum));
        this.loadLines(this.lineEntries.filter(e => failedNums.has(e.lineNum)));
      }
    });
  }
}

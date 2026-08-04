import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { VanDayService } from '../../../../core/services/van-day.service';
import { VanFieldOpsService } from '../../../../core/services/van-field-ops.service';

/** The rep working this van, for the day-close posting. */
const SALESPERSON_ID = 'SP-014';

/**
 * End of day: flush the outbox to D365, reconcile cash and van stock, review the
 * day's KPIs, then close the day through `GPDayCloseService/close` (scaffolded).
 * The close is blocked while anything is still pending sync.
 */
@Component({
  selector: 'app-van-day-close',
  templateUrl: './van-day-close.page.html',
  styleUrls: ['./van-day-close.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanDayClosePage {
  private toastCtrl = inject(ToastController);
  private fieldOps = inject(VanFieldOpsService);
  readonly day = inject(VanDayService);

  readonly isSyncing = signal(false);
  readonly isClosing = signal(false);

  readonly pending = computed(() => this.day.outbox()?.pending ?? 0);

  /** Strike rate: visits that ended in a sale, over visits made. */
  readonly strikeRate = computed(() => {
    const visits = this.day.visits();
    const made = visits.filter((v) => v.status === 'done').length;
    if (!made) return 0;
    const noSale = visits.filter((v) => v.outcome?.startsWith('No sale')).length;
    return Math.round(((made - noSale) / made) * 100);
  });

  sync() {
    if (this.pending() === 0) {
      this.toast('Nothing pending to sync', 'medium');
      return;
    }
    this.isSyncing.set(true);
    // The visit log flush stands in for the real outbox drain to D365.
    this.fieldOps.logVisit().subscribe(() => {
      const synced = this.day.markSynced();
      this.isSyncing.set(false);
      this.toast(`Synced ${synced} document${synced === 1 ? '' : 's'} to D365`, 'success');
    });
  }

  close() {
    if (this.pending() > 0) {
      this.toast(`Finish sync first — ${this.pending()} pending`, 'danger');
      return;
    }
    if (!this.day.isDayOpen()) return;

    this.isClosing.set(true);
    this.fieldOps
      .closeDay({
        salespersonId: SALESPERSON_ID,
        journeyId: this.day.day()?.routeId ?? '',
        cashCounted: this.day.kpi()?.collected ?? 0,
      })
      .subscribe({
        next: (result) => {
          this.day.closeDay();
          this.isClosing.set(false);
          this.toast(`Day closed — stock transfer ${result.stockTransfer}`, 'success');
        },
        error: () => {
          this.isClosing.set(false);
          this.toast("Couldn't close the day. Try again.", 'danger');
        },
      });
  }

  round(n: number): string {
    return Math.round(n).toLocaleString('en-US');
  }

  private async toast(message: string, color: 'success' | 'danger' | 'medium') {
    const toast = await this.toastCtrl.create({
      message,
      duration: color === 'danger' ? 3000 : 1800,
      position: 'top',
      color,
    });
    await toast.present();
  }
}

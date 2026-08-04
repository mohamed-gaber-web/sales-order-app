import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ActionSheetController, ToastController } from '@ionic/angular';
import { VanDayService } from '../../../../core/services/van-day.service';
import { VanFieldOpsService } from '../../../../core/services/van-field-ops.service';

/** Reasons a driver can close a visit without a sale. */
const NO_SALE_REASONS = ['Closed', 'No cash', 'Well stocked', 'Other'];

/**
 * A single customer stop. The driver checks in (GPS geofence), sees the
 * customer's credit position, then sells, collects, takes a return, or closes
 * the visit with no sale. Every action is gated on a check-in.
 */
@Component({
  selector: 'app-van-visit',
  templateUrl: './van-visit.page.html',
  styleUrls: ['./van-visit.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanVisitPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private actionSheetCtrl = inject(ActionSheetController);
  private fieldOps = inject(VanFieldOpsService);
  readonly day = inject(VanDayService);

  readonly visit = this.day.currentVisit;

  readonly isCredit = computed(() => this.visit()?.mode === 'credit');

  /** Headroom left on the account — what the driver can still sell on credit. */
  readonly available = computed(() => {
    const v = this.visit();
    if (!v || v.mode !== 'credit') return 0;
    return Math.max(0, v.limit - v.balance);
  });

  /** Credit utilisation 0–1, for the progress bar. */
  readonly usage = computed(() => {
    const v = this.visit();
    if (!v || v.mode !== 'credit' || !v.limit) return 0;
    return Math.min(1, v.balance / v.limit);
  });

  ngOnInit() {
    // A deep link or a reload lands here without a current visit set — resolve it
    // from the route id against the loaded day.
    if (!this.visit()) {
      const id = Number(this.route.snapshot.paramMap.get('id'));
      if (Number.isFinite(id)) this.day.setCurrentVisit(id);
    }
    if (!this.visit()) {
      this.router.navigate(['/inventory/van-sales']);
    }
  }

  checkIn() {
    const v = this.visit();
    if (!v) return;
    this.day.checkIn(v.id);
    this.fieldOps.logVisit().subscribe();
    this.toast('Checked in — inside the geofence', 'success');
  }

  sell() {
    this.router.navigate(['/inventory/van-sales/catalog']);
  }

  collect() {
    const v = this.visit();
    if (!v) return;
    this.router.navigate(['/inventory/van-sales/collect', v.id]);
  }

  return() {
    const v = this.visit();
    if (!v) return;
    this.router.navigate(['/inventory/van-sales/return', v.id]);
  }

  async endWithoutSale() {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Close visit without a sale',
      buttons: [
        ...NO_SALE_REASONS.map((reason) => ({
          text: reason,
          handler: () => this.confirmNoSale(reason),
        })),
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private confirmNoSale(reason: string) {
    this.day.noSale(reason);
    this.toast(`Visit closed — ${reason}`, 'medium');
    this.router.navigate(['/inventory/van-sales']);
  }

  round(n: number): string {
    return Math.round(n).toLocaleString('en-US');
  }

  private async toast(message: string, color: 'success' | 'medium') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 1600,
      position: 'top',
      color,
    });
    await toast.present();
  }
}

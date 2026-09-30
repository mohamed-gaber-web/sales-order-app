import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { VanDayService } from '../../../../core/services/van-day.service';
import { FormatService } from '../../../../core';
import { round2, VanDocumentsService, VanRoleService, VanStoreService } from '../../../../core/van-sales';

interface CollectionRow {
  id: string;
  name: string;
  balance: number;
  oldestDue: string;
  overdue: boolean;
  creditHold: boolean;
  /** Route visit id, when the customer is on today's journey. */
  visitId: number | null;
  sequence: number;
}

/**
 * The collector's work list: every route customer who still owes money, in
 * journey order, with the day's collected total alongside what is outstanding.
 */
@Component({
  selector: 'app-van-collections',
  templateUrl: './van-collections.page.html',
  styleUrls: ['./van-collections.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanCollectionsPage {
  private readonly format = inject(FormatService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly store = inject(VanStoreService);
  /** Sellers see who to collect from, not how much each customer owes. */
  readonly role = inject(VanRoleService);
  private readonly docs = inject(VanDocumentsService);
  private readonly day = inject(VanDayService);

  readonly rows = computed<CollectionRow[]>(() => {
    const visits = this.day.visits();
    const byAccount = new Map(visits.map((v, i) => [v.account, { id: v.id, index: i }]));
    const journey = new Map((this.store.master()?.journey ?? []).map((j) => [j.customerId, j.sequence]));

    return this.store
      .customers()
      .map((c) => ({ c, balance: this.store.balanceOf(c.id) }))
      .filter(({ balance }) => balance > 0)
      .map(({ c, balance }): CollectionRow => {
        const due = c.openInvoices
          .filter((i) => i.amount > 0)
          .map((i) => i.dueDate ?? i.date)
          .sort();
        const visit = byAccount.get(c.id);
        return {
          id: c.id,
          name: c.name,
          balance,
          oldestDue: due[0] ?? '',
          overdue: c.overdue,
          creditHold: c.creditHold,
          visitId: visit?.id ?? null,
          sequence: visit ? visit.index : 1000 + (journey.get(c.id) ?? 1000),
        };
      })
      .sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name));
  });

  readonly outstanding = computed(() => round2(this.rows().reduce((s, r) => s + r.balance, 0)));

  readonly collectedToday = computed(() =>
    round2(
      this.docs
        .todays()
        .filter((d) => d.type === 'RECEIPT')
        .reduce((s, d) => s + d.total, 0)
    )
  );

  open(row: CollectionRow) {
    const visit = this.day.visits().find((v) => v.account === row.id);
    if (!visit) {
      void this.toast(`${row.name} isn't on today's route.`);
      return;
    }
    this.day.setCurrentVisit(visit.id);
    this.router.navigate(['/inventory/van-sales/visit', visit.id]);
  }

  money(n: number): string {
    return this.format.number(n, 2, 2);
  }

  private async toast(message: string) {
    const toast = await this.toastCtrl.create({ message, duration: 2400, position: 'top', color: 'medium' });
    await toast.present();
  }
}

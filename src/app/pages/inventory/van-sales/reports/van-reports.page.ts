import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Platform, ToastController } from '@ionic/angular';
import { FormatService } from '../../../../core';
import { VanDayService } from '../../../../core/services/van-day.service';
import {
  agingBuckets,
  buildReport,
  ChequeRecord,
  ChequeStatus,
  deltaPct,
  demoActivity,
  documentsCsv,
  EDocStatus,
  localIsoDate,
  periodRange,
  previousPeriodEnd,
  ReportPeriod,
  VanDocument,
  VanDocumentsService,
  VanOutboxService,
  VanRoleService,
  VanStoreService,
} from '../../../../core/van-sales';
import { VAN_SALES_CONFIG } from '../../../../core/van-sales/van-sales.config';
import { BarRow } from '../../../../shared/charts';

const DEMO_KEY = 'gp.vanSales.reportsDemo';

const PERIODS: { key: ReportPeriod; label: string; current: string; previous: string }[] = [
  { key: 'TODAY', label: 'Today', current: 'Today', previous: 'Yesterday' },
  { key: '7D', label: '7 days', current: 'Last 7 days', previous: 'Previous 7 days' },
  { key: '30D', label: '30 days', current: 'Last 30 days', previous: 'Previous 30 days' },
];

/** Reserved status colours — always shown with an icon and a label. */
const EDOC_STATUS: Record<EDocStatus, { icon: string; tone: string; order: number }> = {
  VALID: { icon: 'checkmark-circle', tone: 'good', order: 0 },
  SUBMITTED: { icon: 'time', tone: 'warning', order: 1 },
  QUEUED: { icon: 'cloud-upload', tone: 'neutral', order: 2 },
  REJECTED: { icon: 'alert-circle', tone: 'critical', order: 3 },
  NOT_REQUIRED: { icon: 'remove-circle', tone: 'neutral', order: 4 },
};

/** The cheque lifecycle in order; bounced is the branch off "deposited". */
const CHEQUE_STEPS: { status: ChequeStatus; label: string; icon: string }[] = [
  { status: 'WITH_REP', label: 'With rep', icon: 'person' },
  { status: 'HANDED_TO_TREASURY', label: 'Treasury', icon: 'business' },
  { status: 'DEPOSITED', label: 'Deposited', icon: 'arrow-down-circle' },
  { status: 'CLEARED', label: 'Cleared', icon: 'checkmark-done' },
];

const AGING_COLORS = ['var(--viz-ord-1)', 'var(--viz-ord-2)', 'var(--viz-ord-3)', 'var(--viz-ord-4)', 'var(--viz-ord-5)'];

export interface Kpi {
  key: string;
  label: string;
  icon: string;
  value: string;
  sub: string;
  delta: number | null;
  /** Whether a rise is good news — returns rising is not. */
  upIsGood: boolean;
}

/**
 * Van Sales dashboard: sales, money in, credit exposure and operations for a
 * period, each figure set against the previous period of the same length.
 *
 * Computed from this device's documents (`van-reports.ts`), so it works
 * offline and needs no backend call. In demo mode a seeded, generated history
 * (`van-demo-data.ts`) is added so the dashboard can be shown before any real
 * activity exists; demo documents are never stored or sent.
 */
@Component({
  selector: 'app-van-reports',
  templateUrl: './van-reports.page.html',
  styleUrls: ['./van-reports.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanReportsPage {
  private readonly fmt = inject(FormatService);
  private readonly toastCtrl = inject(ToastController);
  private readonly platform = inject(Platform);
  private readonly docs = inject(VanDocumentsService);
  readonly store = inject(VanStoreService);
  readonly day = inject(VanDayService);
  readonly outbox = inject(VanOutboxService);
  readonly role = inject(VanRoleService);

  readonly periods = PERIODS;
  readonly chequeSteps = CHEQUE_STEPS;
  readonly agingColors = AGING_COLORS;
  readonly period = signal<ReportPeriod>('7D');
  readonly today = signal(localIsoDate());
  /** Demo data is on by default while the app runs against the mock backend. */
  readonly demo = signal(readDemo());

  readonly periodInfo = computed(() => PERIODS.find((p) => p.key === this.period())!);

  private readonly demoData = computed(() => (this.demo() ? demoActivity(this.today()) : null));

  readonly documents = computed<VanDocument[]>(() => {
    const real = this.docs.documents();
    const demo = this.demoData();
    return demo ? [...real, ...demo.documents] : real;
  });

  private readonly cheques = computed<ChequeRecord[]>(() => {
    const demo = this.demoData();
    return demo ? [...this.docs.cheques(), ...demo.cheques] : this.docs.cheques();
  });

  readonly report = computed(() => buildReport(this.documents(), this.period(), this.today()));
  readonly previous = computed(() =>
    buildReport(this.documents(), this.period(), previousPeriodEnd(this.period(), this.today()))
  );
  readonly previousTrend = computed(() => this.previous().trend.map((t) => t.value));

  readonly salesDelta = computed(() => deltaPct(this.report().sales.total, this.previous().sales.total));

  readonly kpis = computed<Kpi[]>(() => {
    const r = this.report();
    const p = this.previous();
    return [
      {
        key: 'collected',
        label: 'Collected',
        icon: 'wallet',
        value: this.compact(r.collections.total),
        sub: `${r.collections.count} receipts`,
        delta: deltaPct(r.collections.total, p.collections.total),
        upIsGood: true,
      },
      {
        key: 'avg',
        label: 'Avg invoice',
        icon: 'receipt',
        value: this.compact(r.sales.avgDrop),
        sub: `${r.sales.count} invoices`,
        delta: deltaPct(r.sales.avgDrop, p.sales.avgDrop),
        upIsGood: true,
      },
      {
        key: 'orders',
        label: 'Orders taken',
        icon: 'clipboard',
        value: this.compact(r.orders.total),
        sub: `${r.orders.count} orders`,
        delta: deltaPct(r.orders.total, p.orders.total),
        upIsGood: true,
      },
      {
        key: 'returns',
        label: 'Returns',
        icon: 'arrow-undo',
        value: this.compact(r.returns.total),
        sub: `${this.returnRate()}% of sales`,
        delta: deltaPct(r.returns.total, p.returns.total),
        upIsGood: false,
      },
    ];
  });

  readonly returnRate = computed(() => {
    const r = this.report();
    return r.sales.total > 0 ? Math.round((r.returns.total / r.sales.total) * 1000) / 10 : 0;
  });

  readonly paySplit = computed<BarRow[]>(() => [
    { key: 'CASH', label: 'Cash', value: this.report().sales.cash },
    { key: 'CREDIT', label: 'Credit', value: this.report().sales.credit },
  ]);

  /** One plain-language line per section, so the point is read before the chart. */
  readonly insights = computed(() => {
    const r = this.report();
    const top = r.byProduct[0];
    const cust = r.byCustomer[0];
    const cash = r.collections.byMethod.find((m) => m.key === 'CASH');
    return {
      product: top && r.sales.total ? `${top.label} leads with ${this.share(top.value, this.productTotal())}% of net sales.` : '',
      customer: cust ? `${cust.label} is the biggest buyer: ${this.money(cust.value)}.` : '',
      collections:
        cash && r.collections.total ? `${this.share(cash.value, r.collections.total)}% of collections came in cash.` : '',
    };
  });

  private readonly productTotal = computed(() => this.report().byProduct.reduce((s, p) => s + p.value, 0));

  readonly aging = computed(() => agingBuckets(this.store.customers(), this.today()));
  readonly outstanding = computed(() => this.aging().reduce((s, b) => s + b.value, 0));
  readonly overdue = computed(() => this.aging().slice(1).reduce((s, b) => s + b.value, 0));
  readonly overdueShare = computed(() => this.share(this.overdue(), this.outstanding()));

  readonly strikeRate = computed(() => {
    const done = this.day.visits().filter((v) => v.status === 'done');
    if (!done.length) return null;
    const productive = done.filter((v) => /sold|deliver|order/i.test(v.outcome ?? '')).length;
    return Math.round((productive / done.length) * 100);
  });

  readonly routeProgress = computed(() => {
    const total = this.day.visits().length;
    return total ? this.day.doneCount() / total : 0;
  });

  readonly eDocRows = computed(() =>
    this.report()
      .eDocs.map((s) => ({ ...s, ...EDOC_STATUS[s.key as EDocStatus] }))
      .sort((a, b) => a.order - b.order)
  );
  readonly eDocTotal = computed(() => this.report().eDocs.reduce((s, e) => s + e.value, 0));
  readonly eDocValidPct = computed(() =>
    this.share(this.report().eDocs.find((e) => e.key === 'VALID')?.value ?? 0, this.eDocTotal())
  );

  readonly chequePipeline = computed(() => {
    const { from, to } = periodRange(this.period(), this.today());
    const list = this.cheques().filter((c) => {
      const at = localIsoDate(new Date(c.history[0]?.at ?? Date.now()));
      return at >= from && at <= to;
    });
    const of = (status: ChequeStatus) => list.filter((c) => c.status === status);
    return {
      steps: CHEQUE_STEPS.map((s) => ({ ...s, count: of(s.status).length, total: of(s.status).reduce((a, c) => a + c.amount, 0) })),
      bounced: { count: of('BOUNCED').length, total: of('BOUNCED').reduce((a, c) => a + c.amount, 0) },
      count: list.length,
    };
  });

  readonly hasActivity = computed(() => {
    const r = this.report();
    return r.sales.count + r.orders.count + r.returns.count + r.collections.count > 0;
  });

  // Formatting closures handed to the chart components.
  readonly money = (n: number) => this.fmt.number(n, 2, 2);
  readonly compact = (n: number) =>
    n >= 1_000_000 ? `${this.trim(n / 1_000_000)}M` : n >= 10_000 ? `${this.trim(n / 1000)}K` : this.fmt.number(n, 0, 0);
  readonly trendLabel = (key: string) => {
    if (this.period() === 'TODAY') return `${key.padStart(2, '0')}:00`;
    const d = new Date(`${key}T12:00:00`);
    return this.period() === '7D'
      ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
      : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

  ionViewWillEnter(): void {
    this.today.set(localIsoDate());
    void this.docs.refreshEDocStatus();
  }

  setPeriod(p: ReportPeriod): void {
    this.period.set(p);
  }

  toggleDemo(): void {
    this.demo.set(!this.demo());
    try {
      localStorage.setItem(DEMO_KEY, this.demo() ? '1' : '0');
    } catch {
      // Not remembered — fine for a view preference.
    }
  }

  async refresh(ev: CustomEvent): Promise<void> {
    this.today.set(localIsoDate());
    await Promise.all([this.docs.refreshEDocStatus(), this.store.refresh()]);
    (ev.target as HTMLIonRefresherElement).complete();
  }

  deltaText(d: number | null): string {
    if (d === null) return 'New';
    if (d === 0) return 'No change';
    return `${d > 0 ? '+' : ''}${this.fmt.number(d, 0, 1)}%`;
  }

  deltaTone(k: { delta: number | null; upIsGood: boolean }): 'good' | 'bad' | 'flat' {
    if (k.delta === null || k.delta === 0) return 'flat';
    return k.delta > 0 === k.upIsGood ? 'good' : 'bad';
  }

  deltaIcon(d: number | null): string {
    return d === null || d === 0 ? 'remove' : d > 0 ? 'trending-up' : 'trending-down';
  }

  share(part: number, whole: number): number {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
  }

  /** The period's real documents as CSV — demo rows are never exported. */
  async exportCsv(): Promise<void> {
    const { from, to } = periodRange(this.period(), this.today());
    const docs = this.docs.documents().filter((d) => {
      const at = localIsoDate(new Date(d.createdAt));
      return at >= from && at <= to;
    });
    if (!docs.length) {
      void this.toast(this.demo() ? 'Demo data is not exported. No real documents in this period.' : 'No documents in this period to export.');
      return;
    }
    const csv = documentsCsv(docs);
    const filename = `van-sales-${this.store.repSetup()?.repId ?? 'rep'}-${from}_${to}.csv`;
    try {
      if (this.platform.is('capacitor')) {
        const file = await Filesystem.writeFile({ path: filename, data: csv, directory: Directory.Cache, encoding: Encoding.UTF8 });
        await Share.share({ title: filename, files: [file.uri] });
      } else {
        // BOM so Excel opens Arabic customer names as UTF-8.
        const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      const cancelled = e instanceof Error && /cancel/i.test(e.message);
      if (!cancelled) void this.toast("Couldn't export the report.");
    }
  }

  private trim(n: number): string {
    return this.fmt.number(n, 0, n < 100 ? 1 : 0);
  }

  private async toast(message: string): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 2400, position: 'top', color: 'medium' });
    await t.present();
  }
}

function readDemo(): boolean {
  try {
    const v = localStorage.getItem(DEMO_KEY);
    if (v !== null) return v === '1';
  } catch {
    // Fall through to the default.
  }
  return VAN_SALES_CONFIG.api === 'mock';
}

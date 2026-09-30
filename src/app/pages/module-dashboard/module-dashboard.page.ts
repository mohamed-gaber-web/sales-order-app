import { ChangeDetectionStrategy, Component, computed, effect, inject, Injector, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { MENU_GROUPS } from '../../app-menu';
import { ApiService, FormatService, TenantConfigStore } from '../../core';
import { findDashboard } from './module-dashboard.definitions';
import { createLiveContext } from './module-dashboard.live';
import { DashboardData, DashboardPeriod, Metric, ValueFormat } from './module-dashboard.models';

/** A loaded dashboard is reused for this long before D365 is asked again. */
const CACHE_MS = 2 * 60_000;

interface Loaded {
  data: DashboardData;
  notes: string[];
  at: Date;
}

const cache = new Map<string, Loaded>();

const PERIODS: { key: DashboardPeriod; label: string; current: string; previous: string }[] = [
  { key: 'TODAY', label: 'Today', current: 'Today', previous: 'Yesterday' },
  { key: '7D', label: '7 days', current: 'Last 7 days', previous: 'Previous 7 days' },
  { key: '30D', label: '30 days', current: 'Last 30 days', previous: 'Previous 30 days' },
];

const ORDINAL = ['var(--viz-ord-1)', 'var(--viz-ord-2)', 'var(--viz-ord-3)', 'var(--viz-ord-4)', 'var(--viz-ord-5)'];

const ABOUT_SEEN_KEY = 'gp.moduleDashboard.aboutSeen';

/**
 * A module's dashboard — the first link in each menu group.
 *
 * Leads with the module in plain words (what it is for, who uses it, how to
 * read the page), then one hero figure, four tiles, a trend against the
 * previous period, the stages work passes through, and breakdowns. Every card
 * has an ⓘ that explains the figure; a glossary closes the page.
 *
 * Figures are read live from D365 (see `module-dashboard.live.ts`). A query
 * that fails leaves its block empty and adds a note, instead of blanking the
 * page; changing the period keeps the previous figures on screen, dimmed,
 * until the new ones arrive.
 */
@Component({
  selector: 'app-module-dashboard',
  templateUrl: './module-dashboard.page.html',
  styleUrls: ['./module-dashboard.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModuleDashboardPage {
  private readonly fmt = inject(FormatService);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly injector = inject(Injector);
  private readonly tenant = inject(TenantConfigStore);

  readonly periods = PERIODS;
  readonly ordinal = ORDINAL;
  readonly period = signal<DashboardPeriod>('7D');
  readonly today = signal(localDay());
  /** Card keys whose explanation is open. */
  readonly open = signal<ReadonlySet<string>>(new Set());

  private readonly moduleKey = toSignal(this.route.paramMap.pipe(map((p) => p.get('module') ?? '')), { initialValue: '' });

  readonly def = computed(() => findDashboard(this.moduleKey()));
  readonly periodInfo = computed(() => PERIODS.find((p) => p.key === this.period())!);

  readonly loaded = signal<Loaded | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly data = computed(() => this.loaded()?.data ?? null);
  readonly notes = computed(() => this.loaded()?.notes ?? []);
  /** Guards against a slow response for an old period landing after a newer one. */
  private requestId = 0;

  /** The module's own screens, from the menu, so the dashboard is a way in. */
  readonly links = computed(() => {
    const group = MENU_GROUPS.find((g) => g.moduleKey === this.moduleKey());
    return (group?.items ?? []).filter((i) => i.url && !i.comingSoon && !i.url.startsWith('/module-dashboard'));
  });

  /** The about card starts open the first time a module's dashboard is seen. */
  readonly aboutOpen = signal(false);

  constructor() {
    effect(() => {
      const def = this.def();
      const period = this.period();
      const today = this.today();
      if (def) untracked(() => void this.load(false, def.moduleKey, period, today));
    });

    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      const key = p.get('module') ?? '';
      const seen = readSeen();
      this.aboutOpen.set(!seen.includes(key));
      if (!seen.includes(key)) writeSeen([...seen, key]);
    });
  }

  ionViewWillEnter(): void {
    this.today.set(localDay());
  }

  setPeriod(p: DashboardPeriod): void {
    this.period.set(p);
  }

  async refresh(ev?: CustomEvent): Promise<void> {
    const def = this.def();
    if (def) await this.load(true, def.moduleKey, this.period(), this.today());
    (ev?.target as HTMLIonRefresherElement | undefined)?.complete();
  }

  private async load(force: boolean, moduleKey: string, period: DashboardPeriod, today: string): Promise<void> {
    const def = findDashboard(moduleKey);
    if (!def) return;
    // The app's other screens still scope to 'usmf' when the tenant has not named a company.
    const company = this.tenant.dataAreaId() ?? 'usmf';
    const key = `${moduleKey}:${period}:${today}:${company}`;
    const hit = cache.get(key);
    if (!force && hit && Date.now() - hit.at.getTime() < CACHE_MS) {
      this.loaded.set(hit);
      this.error.set(null);
      return;
    }
    const id = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const ctx = createLiveContext(this.api, this.injector, company, period, today);
      const data = await def.load(ctx);
      if (id !== this.requestId) return;
      const result: Loaded = { data, notes: ctx.notes, at: new Date() };
      cache.set(key, result);
      this.loaded.set(result);
    } catch (e) {
      if (id !== this.requestId) return;
      const detail = (e as { error?: { message?: string } })?.error?.message ?? (e as Error)?.message;
      this.error.set(detail || 'D365 did not answer.');
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }

  updatedAt(): string {
    const at = this.loaded()?.at;
    return at ? at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
  }

  isOpen(key: string): boolean {
    return this.open().has(key);
  }

  toggle(key: string): void {
    const next = new Set(this.open());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.open.set(next);
  }

  // ── Formatting ───────────────────────────────────────────────────────────

  format(value: number, f: ValueFormat): string {
    switch (f) {
      case 'pct':
        return `${this.fmt.number(value, 0, 1)}%`;
      case 'days':
        return `${this.fmt.number(value, 0, 1)} d`;
      case 'money':
        return this.compact(value);
      default:
        return this.compact(value);
    }
  }

  /** Full figure for the hero — the one number worth every digit. */
  heroValue(mtr: Metric): string {
    return mtr.format === 'pct' || mtr.format === 'days' ? this.format(mtr.value, mtr.format) : this.fmt.number(mtr.value, 0, 0);
  }

  readonly compact = (n: number): string =>
    Math.abs(n) >= 1_000_000
      ? `${this.fmt.number(n / 1_000_000, 0, 1)}M`
      : Math.abs(n) >= 10_000
        ? `${this.fmt.number(n / 1000, 0, n < 100_000 ? 1 : 0)}K`
        : this.fmt.number(n, 0, 0);

  private readonly percent = (n: number): string => `${this.fmt.number(n, 0, 1)}%`;

  /** Stable references, so the charts' inputs don't change on every check. */
  formatterFor(f: ValueFormat): (n: number) => string {
    return f === 'pct' ? this.percent : this.compact;
  }

  readonly trendLabel = (key: string): string => {
    if (this.period() === 'TODAY') return `${key.padStart(2, '0')}:00`;
    const d = new Date(`${key}T12:00:00`);
    return this.period() === '7D'
      ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
      : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

  /** A snapshot has nothing to compare against. */
  hasDelta(mtr: Metric): boolean {
    return mtr.previous !== null;
  }

  delta(mtr: Metric): number | null {
    if (mtr.previous === null) return null;
    if (mtr.previous === 0) return mtr.value === 0 ? 0 : null;
    // Rates change in points, not percent-of-percent.
    if (mtr.format === 'pct') return Math.round((mtr.value - mtr.previous) * 10) / 10;
    return Math.round(((mtr.value - mtr.previous) / Math.abs(mtr.previous)) * 1000) / 10;
  }

  deltaText(mtr: Metric): string {
    const d = this.delta(mtr);
    if (d === null) return 'New';
    if (d === 0) return 'No change';
    const unit = mtr.format === 'pct' ? ' pts' : '%';
    return `${d > 0 ? '+' : ''}${this.fmt.number(d, 0, 1)}${unit}`;
  }

  deltaTone(mtr: Metric): 'good' | 'bad' | 'flat' {
    const d = this.delta(mtr);
    if (d === null || d === 0) return 'flat';
    return d > 0 === mtr.upIsGood ? 'good' : 'bad';
  }

  deltaIcon(mtr: Metric): string {
    const d = this.delta(mtr);
    return d === null || d === 0 ? 'remove' : d > 0 ? 'trending-up' : 'trending-down';
  }

  /** Plain-English reading of a delta, for the explanation panels. */
  deltaSentence(mtr: Metric): string {
    if (mtr.previous === null) return 'This is a snapshot of right now, so it has no comparison.';
    const d = this.delta(mtr);
    const prev = this.periodInfo().previous.toLowerCase();
    if (d === null) return `There was nothing to compare against in the ${prev}.`;
    if (d === 0) return `Unchanged from the ${prev}.`;
    const direction = d > 0 ? 'up' : 'down';
    const verdict = this.deltaTone(mtr) === 'good' ? 'which is good news' : 'which needs a look';
    return `${direction === 'up' ? 'Up' : 'Down'} ${this.deltaText(mtr).replace(/^[+-]/, '')} from the ${prev} (${this.format(mtr.previous ?? 0, mtr.format)}), ${verdict}.`;
  }

  colorsFor(ordinal: boolean | undefined): string[] | null {
    return ordinal ? this.ordinal : null;
  }
}

function localDay(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function readSeen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(ABOUT_SEEN_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeSeen(keys: string[]): void {
  try {
    localStorage.setItem(ABOUT_SEEN_KEY, JSON.stringify(keys));
  } catch {
    // Not remembered — the card simply opens again next time.
  }
}

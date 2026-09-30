import { Injector, ProviderToken } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ODataResponse } from '../../core/models/lookup.models';
import { BarRow } from '../../shared/charts';
import { DashboardPeriod } from './module-dashboard.models';

/**
 * Live data for module dashboards — read-only OData through the admin
 * portal's `/d365` pass-through (`ApiService`), so every query runs as the
 * signed-in user, scoped to their company by the `x-d365-company` header.
 *
 * Paging uses `$top`/`$skip`, not `@odata.nextLink`: the link D365 returns
 * points at D365 itself and would bypass the portal. Each query is capped, and
 * the dashboard says so when a cap is reached rather than silently undercounting.
 */

export const PAGE_SIZE = 1000;
export const ROW_CAP = 10_000;

/** Van-day hours shown on Today's trend. */
export const TREND_HOURS = Array.from({ length: 13 }, (_, i) => i + 7);

export interface PeriodWindow {
  /** Inclusive local-midnight start, as a UTC instant for OData. */
  fromIso: string;
  /** Exclusive end (next local midnight after the last day). */
  toIso: string;
  days: string[];
}

export type Row = Record<string, unknown>;

export interface LiveContext {
  period: DashboardPeriod;
  today: string;
  current: PeriodWindow;
  previous: PeriodWindow;
  /** The company (`dataAreaId`) this tenant's queries scope to. */
  company: string;
  /** An app service, for modules whose existing queries are reused as they are. */
  get<T>(token: ProviderToken<T>): T;
  /** Every row matching the query, up to `ROW_CAP`. */
  rows(entity: string, params: Record<string, string>): Promise<Row[]>;
  /** `$count` of rows matching a filter, without fetching them. */
  count(entity: string, filter: string, extra?: Record<string, string>): Promise<number>;
  /** OData filter for `field` inside a window. */
  within(field: string, w: PeriodWindow): string;
  /** A trend over `rows`, bucketed by `dateField` — hourly for Today, else daily. */
  trend(current: Row[], previous: Row[], dateField: string, value: (r: Row) => number): { current: BarRow[]; previous: number[] };
  /** Groups rows, sums a value, keeps the top `n` and folds the rest into "Other". */
  top(rows: Row[], key: (r: Row) => string, value: (r: Row) => number, n?: number, label?: (k: string) => string): BarRow[];
  /** Runs a block; on failure records a note for the page and returns the fallback. */
  safe<T>(what: string, run: () => Promise<T>, fallback: T): Promise<T>;
  /** Notes raised while loading — failed or capped queries. */
  notes: string[];
}

function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function periodSpan(period: DashboardPeriod): number {
  return period === 'TODAY' ? 1 : period === '7D' ? 7 : 30;
}

/** The window ending `endsDaysAgo` days before today, `span` days long. */
export function windowFor(today: string, span: number, endsDaysAgo = 0): PeriodWindow {
  const end = new Date(`${today}T00:00:00`);
  end.setDate(end.getDate() - endsDaysAgo + 1);
  const start = new Date(end);
  start.setDate(end.getDate() - span);
  const days: string[] = [];
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) days.push(localDay(d));
  return { fromIso: start.toISOString(), toIso: end.toISOString(), days };
}

/** True when a D365 date/datetime string falls inside a window — for fields never proven in a server filter. */
export function inWindow(value: unknown, w: PeriodWindow): boolean {
  const t = Date.parse(String(value ?? ''));
  return Number.isFinite(t) && t >= Date.parse(w.fromIso) && t < Date.parse(w.toIso);
}

/** D365 writes 1900-01-01 for "no date". */
export function hasDate(value: unknown): boolean {
  const t = Date.parse(String(value ?? ''));
  return Number.isFinite(t) && new Date(t).getFullYear() > 1900;
}

export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

const r2 = (n: number) => Math.round(n * 100) / 100;

export function createLiveContext(
  api: ApiService,
  injector: Injector,
  company: string,
  period: DashboardPeriod,
  today: string
): LiveContext {
  const span = periodSpan(period);
  const current = windowFor(today, span);
  const previous = windowFor(today, span, span);
  const notes: string[] = [];

  const rows: LiveContext['rows'] = async (entity, params) => {
    const out: Row[] = [];
    for (let skip = 0; skip < ROW_CAP; skip += PAGE_SIZE) {
      const res = await firstValueFrom(
        api.get<ODataResponse<Row>>(entity, { ...params, $top: String(PAGE_SIZE), $skip: String(skip) })
      );
      const page = res.value ?? [];
      out.push(...page);
      if (page.length < PAGE_SIZE) return out;
    }
    notes.push(`${entity.replace('/data/', '')}: only the first ${ROW_CAP.toLocaleString()} rows are counted.`);
    return out;
  };

  const count: LiveContext['count'] = async (entity, filter, extra = {}) => {
    const res = await firstValueFrom(
      api.get<ODataResponse<Row>>(entity, { ...extra, $filter: filter, $count: 'true', $top: '0' })
    );
    return res['@odata.count'] ?? 0;
  };

  const within: LiveContext['within'] = (field, w) => `${field} ge ${w.fromIso} and ${field} lt ${w.toIso}`;

  const trend: LiveContext['trend'] = (cur, prev, dateField, value) => {
    if (period === 'TODAY') {
      const byHour = (list: Row[]) =>
        TREND_HOURS.map((h) =>
          r2(list.filter((r) => new Date(str(r[dateField])).getHours() === h).reduce((s, r) => s + value(r), 0))
        );
      const c = byHour(cur);
      return {
        current: TREND_HOURS.map((h, i) => ({ key: String(h), label: `${h}:00`, value: c[i] })),
        previous: byHour(prev),
      };
    }
    const byDay = (list: Row[], days: string[]) => {
      const m = new Map(days.map((d) => [d, 0]));
      for (const r of list) {
        const d = localDay(new Date(str(r[dateField])));
        if (m.has(d)) m.set(d, r2((m.get(d) ?? 0) + value(r)));
      }
      return days.map((d) => m.get(d) ?? 0);
    };
    const c = byDay(cur, current.days);
    return {
      current: current.days.map((d, i) => ({ key: d, label: d, value: c[i] })),
      previous: byDay(prev, previous.days),
    };
  };

  const top: LiveContext['top'] = (list, key, value, n = 6, label = (k) => k) => {
    const m = new Map<string, { value: number; count: number }>();
    for (const r of list) {
      const k = key(r) || '—';
      const cur = m.get(k) ?? { value: 0, count: 0 };
      cur.value = r2(cur.value + value(r));
      cur.count++;
      m.set(k, cur);
    }
    const sorted = [...m].map(([k, v]) => ({ key: k, label: label(k), value: v.value, count: v.count })).sort((a, b) => b.value - a.value);
    if (sorted.length <= n) return sorted;
    const rest = sorted.slice(n);
    return [
      ...sorted.slice(0, n),
      {
        key: '__other',
        label: `Other (${rest.length})`,
        value: r2(rest.reduce((s, x) => s + x.value, 0)),
        count: rest.reduce((s, x) => s + (x.count ?? 0), 0),
      },
    ];
  };

  const safe: LiveContext['safe'] = async (what, run, fallback) => {
    try {
      return await run();
    } catch (e) {
      const detail = (e as { error?: { message?: string } })?.error?.message ?? (e as Error)?.message ?? '';
      notes.push(`${what} couldn't be loaded from D365${detail ? ` (${detail})` : ''}.`);
      return fallback;
    }
  };

  const get = <T>(token: ProviderToken<T>): T => injector.get(token);

  return { period, today, current, previous, company, get, rows, count, within, trend, top, safe, notes };
}

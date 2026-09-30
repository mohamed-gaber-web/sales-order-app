import { BarRow } from '../../shared/charts';
import type { LiveContext } from './module-dashboard.live';

/**
 * The shape of a module dashboard — one per menu group (Sales order,
 * Inventory, Purchase order…). A definition supplies the words (what the
 * module is for, what each figure means) and a `load` that reads the figures
 * from D365; the page renders any definition the same way, so every module's
 * dashboard reads alike.
 */

export type DashboardPeriod = 'TODAY' | '7D' | '30D';
export type ValueFormat = 'number' | 'money' | 'pct' | 'days';
export type Tone = 'good' | 'warning' | 'critical' | 'neutral';

export interface Metric {
  key: string;
  label: string;
  icon: string;
  format: ValueFormat;
  value: number;
  /**
   * Same metric for the previous period of equal length. `null` for a
   * snapshot (stock on hand, open orders now) — D365 keeps no history of it,
   * so the page shows no comparison rather than an invented one.
   */
  previous: number | null;
  /** Whether a rise is good news — backorders rising is not. */
  upIsGood: boolean;
  /** Plain-language meaning and how it is worked out. */
  explain: string;
}

export interface TrendBlock {
  title: string;
  explain: string;
  format: ValueFormat;
  current: BarRow[];
  previous: number[];
}

export interface BreakdownBlock {
  key: string;
  title: string;
  explain: string;
  kind: 'bars' | 'split';
  format: ValueFormat;
  countLabel?: string;
  rows: BarRow[];
  /** The one-line takeaway shown above the chart. */
  insight?: string;
  /** Ordered categories (aging, stages) get an ordinal ramp. */
  ordinal?: boolean;
}

export interface PipelineStep {
  label: string;
  icon: string;
  count: number;
}

export interface PipelineBlock {
  title: string;
  explain: string;
  steps: PipelineStep[];
}

export interface AttentionItem {
  tone: Tone;
  text: string;
}

export interface DashboardData {
  /**
   * Every figure is a snapshot of right now — the module has no dated history
   * the app can read — so the page hides the period picker instead of
   * offering one that changes nothing.
   */
  snapshot?: boolean;
  hero: Metric;
  kpis: Metric[];
  /** Absent for a module whose figures are all snapshots with no dates. */
  trend?: TrendBlock;
  pipeline?: PipelineBlock;
  breakdowns: BreakdownBlock[];
  attention: AttentionItem[];
}

export interface ModuleDashboardDef {
  moduleKey: string;
  title: string;
  icon: string;
  /** What the module is for, in two sentences. */
  intro: string;
  /** Who uses it, day to day. */
  audience: string;
  heroCaption: string;
  glossary: { term: string; meaning: string }[];
  /** Where the figures come from, named for the reader. */
  sources: string[];
  load(ctx: LiveContext): Promise<DashboardData>;
}

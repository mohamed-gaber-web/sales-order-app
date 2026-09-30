import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { BarRow } from './bar-list.component';

/** Categorical slots in fixed order — colour follows the entity, never its rank. */
const SLOTS = ['var(--viz-series-1)', 'var(--viz-series-2)', 'var(--viz-series-3)'];

/**
 * Part-to-whole as one stacked bar (up to three parts): collections by method,
 * cash vs credit. Segments are separated by a 2px surface gap; the legend is
 * always shown and doubles as the direct labels (name, amount, share), so
 * identity never rests on colour alone.
 */
@Component({
  selector: 'app-split-bar',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./split-bar.component.scss'],
  template: `
    @if (total() > 0) {
      @if (!showTable()) {
        <div class="bar" role="img" [attr.aria-label]="ariaSummary()">
          @for (p of parts(); track p.key; let i = $index) {
            @if (p.value > 0) {
              <button
                type="button"
                class="seg"
                [class.dim]="activeKey() && activeKey() !== p.key"
                [style.flex-grow]="p.value"
                [style.background]="slot(i)"
                (click)="toggle(p.key)"
                (mouseenter)="activeKey.set(p.key)"
                (mouseleave)="activeKey.set(null)"
                [attr.aria-label]="p.label + ', ' + format()(p.value)"></button>
            }
          }
        </div>
        <ul class="legend" role="list">
          @for (p of parts(); track p.key; let i = $index) {
            <li [class.dim]="activeKey() && activeKey() !== p.key">
              <span class="swatch" [style.background]="slot(i)"></span>
              <span class="name">{{ p.label }}</span>
              <span class="amount">{{ format()(p.value) }}</span>
              <span class="pct">{{ share(p.value) }}%</span>
            </li>
          }
        </ul>
      } @else {
        <table class="table">
          <thead><tr><th>{{ labelHeader() }}</th><th class="num">Share</th><th class="num">Amount</th></tr></thead>
          <tbody>
            @for (p of parts(); track p.key) {
              <tr><td>{{ p.label }}</td><td class="num">{{ share(p.value) }}%</td><td class="num">{{ format()(p.value) }}</td></tr>
            }
          </tbody>
        </table>
      }
      <button type="button" class="view-toggle" (click)="showTable.set(!showTable())">
        {{ showTable() ? 'Show chart' : 'Show table' }}
      </button>
    } @else {
      <p class="empty">{{ emptyText() }}</p>
    }
  `,
})
export class SplitBarComponent {
  readonly parts = input<BarRow[]>([]);
  readonly format = input<(n: number) => string>((n) => String(n));
  readonly labelHeader = input('Part');
  readonly emptyText = input('Nothing in this period.');

  readonly activeKey = signal<string | null>(null);
  readonly showTable = signal(false);

  readonly total = computed(() => this.parts().reduce((s, p) => s + Math.max(0, p.value), 0));

  readonly ariaSummary = computed(() =>
    this.parts()
      .map((p) => `${p.label} ${this.share(p.value)}%`)
      .join(', ')
  );

  slot(i: number): string {
    return SLOTS[i] ?? SLOTS[SLOTS.length - 1];
  }

  share(value: number): number {
    const t = this.total();
    return t > 0 ? Math.round((Math.max(0, value) / t) * 100) : 0;
  }

  toggle(key: string): void {
    this.activeKey.set(this.activeKey() === key ? null : key);
  }
}

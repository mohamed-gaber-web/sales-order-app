import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

export interface BarRow {
  key: string;
  label: string;
  value: number;
  count?: number;
}

/**
 * Horizontal bars for a ranked list — top products, customers, reasons, aging.
 *
 * One series, so no legend box: the card title names it. Every bar carries a
 * direct value label, and tapping (or hovering) a row shows its detail in the
 * readout line — the per-mark hover layer, sized to the whole row so a thumb
 * can hit it. `colors` gives an ordinal ramp per row; otherwise one hue.
 */
@Component({
  selector: 'app-bar-list',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./bar-list.component.scss'],
  template: `
    @if (rows().length) {
      <p class="readout" aria-live="polite">
        @if (active(); as a) {
          <strong>{{ a.label }}</strong> · {{ format()(a.value) }}
          @if (a.count !== undefined && countLabel()) { · {{ a.count }} {{ countLabel() }} }
          @if (total() > 0) { · {{ share(a.value) }}% }
        } @else {
          <span class="muted">Tap a bar for detail</span>
        }
      </p>

      @if (!showTable()) {
        <ul class="bars" role="list">
          @for (r of rows(); track r.key; let i = $index) {
            <li
              class="row"
              [class.dim]="activeKey() && activeKey() !== r.key"
              tabindex="0"
              (click)="toggle(r.key)"
              (keydown.enter)="toggle(r.key)"
              (mouseenter)="activeKey.set(r.key)"
              (mouseleave)="activeKey.set(null)"
              [attr.aria-label]="r.label + ', ' + format()(r.value)">
              <span class="label">{{ r.label }}</span>
              <span class="track">
                <span class="fill" [style.width.%]="width(r.value)" [style.background]="colorOf(i)"></span>
              </span>
              <span class="value">{{ format()(r.value) }}</span>
            </li>
          }
        </ul>
      } @else {
        <table class="table">
          <thead>
            <tr>
              <th>{{ labelHeader() }}</th>
              @if (countLabel()) { <th class="num">{{ countLabel() }}</th> }
              <th class="num">{{ valueHeader() }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.key) {
              <tr>
                <td>{{ r.label }}</td>
                @if (countLabel()) { <td class="num">{{ r.count ?? '—' }}</td> }
                <td class="num">{{ format()(r.value) }}</td>
              </tr>
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
export class BarListComponent {
  readonly rows = input<BarRow[]>([]);
  readonly format = input<(n: number) => string>((n) => String(n));
  readonly colors = input<string[] | null>(null);
  readonly countLabel = input('');
  readonly labelHeader = input('Name');
  readonly valueHeader = input('Value');
  readonly emptyText = input('Nothing in this period.');

  readonly activeKey = signal<string | null>(null);
  readonly showTable = signal(false);

  readonly max = computed(() => Math.max(0, ...this.rows().map((r) => r.value)));
  readonly total = computed(() => this.rows().reduce((s, r) => s + Math.max(0, r.value), 0));
  readonly active = computed(() => this.rows().find((r) => r.key === this.activeKey()) ?? null);

  width(value: number): number {
    const max = this.max();
    // A non-zero value always shows a sliver, so "small" never reads as "none".
    return max > 0 && value > 0 ? Math.max(2, (value / max) * 100) : 0;
  }

  share(value: number): number {
    return Math.round((Math.max(0, value) / this.total()) * 100);
  }

  colorOf(i: number): string {
    const c = this.colors();
    return c?.length ? c[Math.min(i, c.length - 1)] : 'var(--viz-series-1)';
  }

  toggle(key: string): void {
    this.activeKey.set(this.activeKey() === key ? null : key);
  }
}

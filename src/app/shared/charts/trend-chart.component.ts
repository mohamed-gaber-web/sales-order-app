import { ChangeDetectionStrategy, Component, computed, ElementRef, input, signal, viewChild } from '@angular/core';
import { BarRow } from './bar-list.component';

/**
 * This period against the previous one, on one axis.
 *
 * Paths are drawn in a 0–100 SVG box with non-scaling strokes, so the chart
 * reflows to any width while lines stay 2px; axis text is HTML so it never
 * stretches. The crosshair snaps to the nearest point under the pointer (or
 * the arrow keys), and the tooltip lists both series at that point — the
 * reader aims at a time, never at a line. The time axis runs left to right in
 * both languages, as dates do on a calendar strip.
 */
@Component({
  selector: 'app-trend-chart',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./trend-chart.component.scss'],
  template: `
    <ul class="legend" role="list">
      <li><span class="key current"></span>{{ currentLabel() }}</li>
      <li><span class="key previous"></span>{{ previousLabel() }}</li>
    </ul>

    @if (!showTable()) {
      <div class="frame">
        <div class="plot">
          @for (t of ticks(); track t) {
            <div class="gridline" [class.base]="t === 0" [style.bottom.%]="(t / scaleMax()) * 100">
              <span class="tick">{{ short()(t) }}</span>
            </div>
          }

          <svg class="lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path class="area" [attr.d]="areaPath()"></path>
            <path class="line previous" [attr.d]="linePath(previousValues())" vector-effect="non-scaling-stroke"></path>
            <path class="line current" [attr.d]="linePath(values())" vector-effect="non-scaling-stroke"></path>
          </svg>

          @if (lastIndex() >= 0) {
            <span class="end-dot" [style.left.%]="x(lastIndex())" [style.bottom.%]="y(values()[lastIndex()])"></span>
          }

          @if (hover() !== null) {
            <span class="crosshair" [style.left.%]="x(hover()!)"></span>
            <span class="hover-dot" [style.left.%]="x(hover()!)" [style.bottom.%]="y(values()[hover()!])"></span>
            <div class="tooltip" [style.left.%]="tooltipLeft()" [class.flip]="x(hover()!) > 60">
              <span class="tt-title">{{ label()(rows()[hover()!].key) }}</span>
              <span class="tt-row"><span class="key current"></span><strong>{{ format()(values()[hover()!]) }}</strong></span>
              <span class="tt-row"><span class="key previous"></span>{{ format()(previousValues()[hover()!] ?? 0) }}</span>
            </div>
          }

          <div
            #hit
            class="hit"
            tabindex="0"
            role="img"
            [attr.aria-label]="ariaSummary()"
            (pointermove)="onPointer($event)"
            (pointerdown)="onPointer($event)"
            (pointerleave)="hover.set(null)"
            (blur)="hover.set(null)"
            (keydown)="onKey($event)"></div>
        </div>
        <div class="xlabels">
          @for (xl of xLabels(); track xl.key) {
            <span>{{ label()(xl.key) }}</span>
          }
        </div>
      </div>
    } @else {
      <table class="table">
        <thead>
          <tr><th>{{ labelHeader() }}</th><th class="num">{{ currentLabel() }}</th><th class="num">{{ previousLabel() }}</th></tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.key; let i = $index) {
            <tr>
              <td>{{ label()(r.key) }}</td>
              <td class="num">{{ format()(r.value) }}</td>
              <td class="num">{{ format()(previousValues()[i] ?? 0) }}</td>
            </tr>
          }
        </tbody>
      </table>
    }
    <button type="button" class="view-toggle" (click)="showTable.set(!showTable())">
      {{ showTable() ? 'Show chart' : 'Show table' }}
    </button>
  `,
})
export class TrendChartComponent {
  readonly rows = input<BarRow[]>([]);
  /** The previous period's values, aligned by position with `rows`. */
  readonly previous = input<number[]>([]);
  readonly format = input<(n: number) => string>((n) => String(n));
  readonly short = input<(n: number) => string>((n) => String(n));
  readonly label = input<(key: string) => string>((k) => k);
  readonly currentLabel = input('This period');
  readonly previousLabel = input('Previous period');
  readonly labelHeader = input('Day');

  readonly hover = signal<number | null>(null);
  readonly showTable = signal(false);
  private readonly hit = viewChild<ElementRef<HTMLElement>>('hit');

  readonly values = computed(() => this.rows().map((r) => r.value));
  readonly previousValues = computed(() => this.rows().map((_, i) => this.previous()[i] ?? 0));

  /** Last point with activity — where the current line ends and gets its dot. */
  readonly lastIndex = computed(() => {
    const v = this.values();
    for (let i = v.length - 1; i >= 0; i--) if (v[i] > 0) return i;
    return v.length ? v.length - 1 : -1;
  });

  readonly scaleMax = computed(() => {
    const max = Math.max(0, ...this.values(), ...this.previousValues());
    if (max <= 0) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(max));
    const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * magnitude >= max) ?? 10;
    return step * magnitude;
  });

  readonly ticks = computed(() => {
    const m = this.scaleMax();
    return [0, m / 2, m];
  });

  readonly xLabels = computed(() => {
    const r = this.rows();
    if (r.length <= 3) return r;
    return [r[0], r[Math.floor((r.length - 1) / 2)], r[r.length - 1]];
  });

  readonly ariaSummary = computed(() => {
    const total = this.values().reduce((s, v) => s + v, 0);
    const prev = this.previousValues().reduce((s, v) => s + v, 0);
    return `Sales trend. ${this.currentLabel()} ${this.format()(total)}; ${this.previousLabel()} ${this.format()(prev)}. Use arrow keys to read each point.`;
  });

  readonly tooltipLeft = computed(() => {
    const h = this.hover();
    return h === null ? 0 : this.x(h);
  });

  x(i: number): number {
    const n = this.rows().length;
    return n <= 1 ? 50 : (i / (n - 1)) * 100;
  }

  y(v: number): number {
    return (Math.max(0, v) / this.scaleMax()) * 100;
  }

  linePath(values: number[]): string {
    if (!values.length) return '';
    return values.map((v, i) => `${i ? 'L' : 'M'}${this.x(i).toFixed(2)},${(100 - this.y(v)).toFixed(2)}`).join(' ');
  }

  /** A 10% wash under the current line only — the previous period stays a line. */
  areaPath(): string {
    const v = this.values();
    if (!v.length) return '';
    return `${this.linePath(v)} L${this.x(v.length - 1).toFixed(2)},100 L${this.x(0).toFixed(2)},100 Z`;
  }

  onPointer(ev: PointerEvent): void {
    const el = this.hit()?.nativeElement;
    const n = this.rows().length;
    if (!el || !n) return;
    const rect = el.getBoundingClientRect();
    const ratio = (ev.clientX - rect.left) / rect.width;
    this.hover.set(Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1)))));
  }

  onKey(ev: KeyboardEvent): void {
    const n = this.rows().length;
    if (!n) return;
    const cur = this.hover() ?? this.lastIndex();
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      this.hover.set(Math.min(n - 1, Math.max(0, cur + (ev.key === 'ArrowRight' ? 1 : -1))));
      ev.preventDefault();
    } else if (ev.key === 'Escape') {
      this.hover.set(null);
    }
  }
}

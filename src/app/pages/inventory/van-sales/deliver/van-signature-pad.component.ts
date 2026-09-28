import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';

/**
 * A proof-of-delivery signature pad.
 *
 * Pointer events cover mouse, pen and touch in one path; `touch-action: none`
 * stops the page scrolling under the finger. The backing store is scaled by
 * devicePixelRatio so strokes stay crisp on phone screens, and the drawing is
 * kept as strokes so a resize (rotation) can redraw it instead of losing it.
 *
 * Emits a PNG data URL after every stroke, or null once cleared.
 */
@Component({
  selector: 'app-van-signature-pad',
  template: `
    <div class="pad" [class.empty]="isEmpty()">
      <canvas
        #canvas
        (pointerdown)="onDown($event)"
        (pointermove)="onMove($event)"
        (pointerup)="onUp($event)"
        (pointercancel)="onUp($event)"
        (pointerleave)="onUp($event)"></canvas>
      @if (isEmpty()) {
        <span class="placeholder">{{ placeholder }}</span>
      }
      <span class="baseline"></span>
    </div>
    <div class="pad-actions">
      <span class="pad-hint">{{ isEmpty() ? 'Signature required' : 'Signed' }}</span>
      <button type="button" class="clear" [disabled]="isEmpty() || disabled" (click)="clear()">
        <ion-icon name="refresh-outline"></ion-icon> Clear
      </button>
    </div>
  `,
  styleUrls: ['./van-signature-pad.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanSignaturePadComponent implements AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);

  @Input() placeholder = 'Customer signs here';
  @Input() disabled = false;
  @Output() signatureChange = new EventEmitter<string | null>();

  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly isEmpty = signal(true);

  private strokes: { x: number; y: number }[][] = [];
  private current: { x: number; y: number }[] | null = null;
  private pointerId: number | null = null;
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.zone.run(() => this.resize()));
      this.resizeObserver.observe(this.canvasRef.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  onDown(e: PointerEvent): void {
    if (this.disabled || this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.canvasRef.nativeElement.setPointerCapture?.(e.pointerId);
    this.current = [this.point(e)];
    this.strokes.push(this.current);
    this.redraw();
  }

  onMove(e: PointerEvent): void {
    if (!this.current || e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) this.current.push(this.point(ev));
    this.redraw();
  }

  onUp(e: PointerEvent): void {
    if (!this.current || e.pointerId !== this.pointerId) return;
    this.current = null;
    this.pointerId = null;
    this.isEmpty.set(false);
    this.signatureChange.emit(this.canvasRef.nativeElement.toDataURL('image/png'));
  }

  clear(): void {
    this.strokes = [];
    this.current = null;
    this.pointerId = null;
    this.redraw();
    this.isEmpty.set(true);
    this.signatureChange.emit(null);
  }

  private point(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private resize(): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    this.redraw();
  }

  private redraw(): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // White background so the PNG reads on a dark receipt viewer too.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = '#002559';
    ctx.fillStyle = '#002559';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of this.strokes) {
      if (s.length === 1) {
        ctx.beginPath();
        ctx.arc(s[0].x, s[0].y, 1.4, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length - 1; i++) {
        const mx = (s[i].x + s[i + 1].x) / 2;
        const my = (s[i].y + s[i + 1].y) / 2;
        ctx.quadraticCurveTo(s[i].x, s[i].y, mx, my);
      }
      const last = s[s.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
  }
}

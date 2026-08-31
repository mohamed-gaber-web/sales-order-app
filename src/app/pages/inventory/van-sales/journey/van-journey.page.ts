import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { VanDayService } from '../../../../core/services/van-day.service';
import { VanJourneyService } from '../../../../core/services/van-journey.service';
import { SalesOrderService } from '../../../../core/services/sales-order.service';
import {
  RouteMode,
  VanRouteService,
} from '../../../../core/services/van-route.service';
import { DeviceLocationService } from '../../../../core/services/device-location.service';
import { SalesOrderHeaderV3Response } from '../../../../models/sales-order.model';
import { GeoPoint, VanVisit } from '../../../../models/van-journey.model';

/** A stop as the list and the map draw it: its place in the day, and the drive to it. */
interface StopRow {
  visit: VanVisit;
  /** Position in the day, 1-based. Also the map pin's number. */
  index: number;
  /**
   * Straight-line km from the previous point, and from the origin along the
   * whole sequence.
   *
   * Null for a stop already done: distance is being measured forward from where
   * the van is now, and a number on a stop that is behind it would read as work
   * still to do.
   */
  km: number | null;
  cumulativeKm: number | null;
}

/** Where distances are being measured from — shown so the driver can trust the order. */
type OriginSource = 'device' | 'last-stop' | 'depot';

/** Fallback origin, used only before the day has loaded. */
const NO_ORIGIN: GeoPoint = { lat: 0, lng: 0 };

/** The schematic map's drawing box, and the margin pins keep inside it. */
const MAP_WIDTH = 300;
const MAP_HEIGHT = 130;
const MAP_PADDING = 18;

/** `date` as `yyyy-MM-dd` in the local zone — the value an `<input type="date">` takes. */
function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A `yyyy-MM-dd` input value back to local midnight on that day.
 *
 * Built field by field rather than with `new Date(value)`, which reads a bare
 * date string as UTC and so lands on the previous day for anyone west of
 * Greenwich — the range would silently shift by one.
 */
function fromDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const parsed = new Date(+match[1], +match[2] - 1, +match[3]);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The driver's home for the day: the ordered route of customer stops, the day's
 * running numbers, and the way into every visit. This is the module's landing
 * page — the entry point the app menu links to.
 */
@Component({
  selector: 'app-van-journey',
  templateUrl: './van-journey.page.html',
  styleUrls: ['./van-journey.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanJourneyPage implements OnInit {
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private journey = inject(VanJourneyService);
  private salesOrders = inject(SalesOrderService);
  private route = inject(VanRouteService);
  private location = inject(DeviceLocationService);
  readonly day = inject(VanDayService);

  // ── Route ordering ─────────────────────────────────────────────────────────

  /**
   * How the remaining stops are sequenced.
   *
   * Opens on `planned` — the order the ERP scheduled, which the customer's
   * delivery window and the branch's loading sequence are built around. A
   * shorter route is an option the driver takes, not one taken for them.
   */
  readonly routeMode = signal<RouteMode>('planned');

  /** The device's last fix, once the driver has asked for one. */
  readonly position = signal<GeoPoint | null>(null);
  readonly locating = signal(false);

  /** True once a location request came back with nothing — permission or no fix. */
  readonly locationDenied = signal(false);

  /**
   * Where the route is measured from.
   *
   * A live fix if there is one; otherwise the last stop the driver finished,
   * which is where the van actually is on a round already under way; otherwise
   * the depot, which is where it is before one starts. Each is a real position,
   * so the ordering is meaningful even with location switched off — it is just
   * less current, which {@link originSource} says out loud.
   */
  readonly origin = computed<GeoPoint>(() => {
    const fix = this.position();
    if (fix) return fix;

    const last = this.day.lastCompletedVisit();
    if (last?.geo) return last.geo;

    return this.day.day()?.depot ?? NO_ORIGIN;
  });

  readonly originSource = computed<OriginSource>(() =>
    this.position() ? 'device' : this.day.lastCompletedVisit()?.geo ? 'last-stop' : 'depot'
  );

  readonly originLabel = computed(() => {
    const source = this.originSource();
    if (source === 'device') return 'from your location';
    if (source === 'last-stop') return 'from your last stop';
    return 'from the depot';
  });

  /**
   * Stops already served, in planned order.
   *
   * Planned, not the order they were served in: the day records only which
   * stop was finished last, not the whole sequence. They are history either
   * way — nothing is measured from them — so the plan's order is the honest
   * one to show rather than a service order that is not actually known.
   */
  private readonly doneVisits = computed(() =>
    this.day.visits().filter((v) => v.status === 'done')
  );

  /**
   * Stops still ahead that can be sequenced, in the ERP's planned order.
   *
   * A stop with no coordinates is left out: it can only come from a day
   * restored from before geography was tracked whose account no longer appears
   * in the plan, and putting it in the sequence would place it at latitude
   * `undefined` and drag every distance around it to nonsense.
   */
  private readonly remainingVisits = computed(() =>
    this.day.visits().filter((v) => v.status !== 'done' && !!v.geo)
  );

  /** Stops ahead that carry no position, shown after the route with no distance. */
  private readonly unplacedVisits = computed(() =>
    this.day.visits().filter((v) => v.status !== 'done' && !v.geo)
  );

  /**
   * The remaining stops, sequenced by the chosen mode and measured.
   *
   * Only the remaining ones are ever reordered. A finished stop is a fact about
   * the day, and shuffling history to shorten a route the van has already
   * driven would be a lie about where it has been.
   */
  private readonly remainingPlan = computed(() =>
    this.route.measure(
      this.origin(),
      this.route.sequence(this.routeMode(), this.origin(), this.remainingVisits())
    )
  );

  /** The whole day as one numbered list: what is done, then what is sequenced. */
  readonly stops = computed<StopRow[]>(() => {
    const done = this.doneVisits().map((visit, i) => ({
      visit,
      index: i + 1,
      km: null,
      cumulativeKm: null,
    }));

    const offset = done.length;
    const ahead = this.remainingPlan().legs.map((leg, i) => ({
      visit: leg.visit,
      index: offset + i + 1,
      km: leg.km,
      cumulativeKm: leg.cumulativeKm,
    }));

    const unplaced = this.unplacedVisits().map((visit, i) => ({
      visit,
      index: offset + ahead.length + i + 1,
      km: null,
      cumulativeKm: null,
    }));

    return [...done, ...ahead, ...unplaced];
  });

  /** Driving still ahead, on the sequence shown. */
  readonly routeKm = computed(() => this.remainingPlan().totalKm);

  /** The same stops in the planned order — the baseline a saving is measured against. */
  private readonly plannedKm = computed(
    () => this.route.measure(this.origin(), this.remainingVisits()).totalKm
  );

  /**
   * Km this sequence saves against the plan.
   *
   * Below a tenth of a km it reads as noise rather than a result, so it is not
   * claimed: on straight-line distances a saving that small is inside the error.
   */
  readonly savedKm = computed(() => {
    if (this.routeMode() === 'planned') return 0;
    const saved = this.plannedKm() - this.routeKm();
    return saved > 0.1 ? saved : 0;
  });

  /**
   * The stops projected onto the schematic map, origin first.
   *
   * The map used to draw a fixed decorative curve through hand-placed pins. Now
   * that stops carry real coordinates it draws the actual route, which is what
   * makes a reorder visible: pick a shorter sequence and the line un-crosses
   * itself on screen. A driver can see the claim, not just read the number.
   *
   * Equirectangular, with longitude scaled by the cosine of the route's
   * latitude so the shape is not stretched sideways. Fine for a few km of city
   * — this is a sketch to read the route's shape from, not a navigation map.
   */
  readonly mapPins = computed(() => {
    const origin = this.origin();
    // Only stops that have a position can be drawn. A stop can be missing one
    // after a day restored from before coordinates existed failed to match the
    // plan; projecting it would put a pin at `NaN` and, because the projection
    // fits the box to its own extremes, drag every other pin off the map with
    // it. It still appears in the list below, without a distance.
    const placed = this.stops().filter((s) => !!s.visit.geo);
    const projected = this.project([origin, ...placed.map((s) => s.visit.geo)]);

    return {
      origin: projected[0],
      stops: placed.map((stop, i) => ({
        ...stop,
        ...projected[i + 1],
        ahead: stop.km !== null,
      })),
    };
  });

  /**
   * The route still to drive, as an SVG polyline: origin, then the stops ahead
   * in sequence.
   *
   * Finished stops are drawn as pins but kept off the line. Including them ran
   * it from where the van is now back across the whole completed part of the
   * day before heading out — and with no device fix, where the van is now *is*
   * the last finished stop, so the line visibly doubled back on itself. Those
   * crossings say nothing about the chosen sequence, which is the one thing
   * this drawing is for.
   */
  readonly mapPath = computed(() => {
    const { origin, stops } = this.mapPins();
    return [origin, ...stops.filter((s) => s.ahead)]
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
  });

  /**
   * Fits a set of positions into the map's drawing box.
   *
   * One scale for both axes, so the route keeps its true proportions; the
   * spare space on the other axis is split evenly to centre it. A degenerate
   * set — every point at one position — has no span to scale, so it is simply
   * centred rather than divided by zero.
   */
  private project(points: GeoPoint[]): { x: number; y: number }[] {
    const midLat =
      points.reduce((sum, p) => sum + p.lat, 0) / Math.max(1, points.length);
    const k = Math.cos((midLat * Math.PI) / 180);

    // North is up, so latitude is negated: bigger lat, smaller y.
    const raw = points.map((p) => ({ x: p.lng * k, y: -p.lat }));

    const xs = raw.map((p) => p.x);
    const ys = raw.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const spanX = Math.max(...xs) - minX;
    const spanY = Math.max(...ys) - minY;

    const usableW = MAP_WIDTH - MAP_PADDING * 2;
    const usableH = MAP_HEIGHT - MAP_PADDING * 2;
    const epsilon = 1e-9;
    const scale = Math.min(
      spanX > epsilon ? usableW / spanX : Infinity,
      spanY > epsilon ? usableH / spanY : Infinity
    );
    const fitted = Number.isFinite(scale) ? scale : 0;

    const offsetX = (MAP_WIDTH - spanX * fitted) / 2;
    const offsetY = (MAP_HEIGHT - spanY * fitted) / 2;

    return raw.map((p) => ({
      x: (p.x - minX) * fitted + offsetX,
      y: (p.y - minY) * fitted + offsetY,
    }));
  }

  /** Sales orders created in the selected range, from the ERP. */
  readonly orders = signal<SalesOrderHeaderV3Response[]>([]);
  readonly ordersLoading = signal(false);

  /** How many the range actually holds, from OData's `$count`. */
  readonly ordersTotal = signal(0);

  /**
   * True when the range holds more orders than one page returns.
   *
   * Surfaced rather than swallowed: the list is capped and does not page, so a
   * wide range silently shows only the oldest slice of it. A driver checking a
   * month's orders against a total from anywhere else needs to be told the
   * screen is not showing all of them.
   */
  readonly ordersTruncated = computed(
    () => this.ordersTotal() > this.orders().length
  );

  /**
   * The stop list's date range, as `yyyy-MM-dd` input values.
   *
   * Both start on today, so the screen opens on the driver's own day and the
   * filter is something they reach for rather than something they must clear.
   */
  readonly fromDate = signal(toDateInput(new Date()));
  readonly toDate = signal(toDateInput(new Date()));

  /**
   * Today, for the pickers' `max` — no order can be created in the future.
   *
   * A signal, not a constant read at construction: a van sales day can outlast
   * a calendar one. On a night round the screen would otherwise keep yesterday
   * as "today", head the section "Today's orders" over yesterday's, and set a
   * `max` that refuses the actual current date. Refreshed whenever the orders
   * are re-read, which is every route in and out of this list.
   */
  readonly today = signal(toDateInput(new Date()));

  /** True while the range is a single day: the card layout leans on it. */
  readonly singleDay = computed(() => this.fromDate() === this.toDate());

  /** True while the range is today only — i.e. the screen's default view. */
  readonly isToday = computed(
    () => this.fromDate() === this.today() && this.toDate() === this.today()
  );

  /** Heading for the orders list: 'Today's orders', or the range being shown. */
  readonly rangeLabel = computed(() => {
    if (this.isToday()) return "Today's orders";
    const from = fromDateInput(this.fromDate());
    const to = fromDateInput(this.toDate());
    if (!from || !to) return 'Orders';
    if (this.singleDay()) return `Orders · ${this.shortDate(from)}`;
    return `Orders · ${this.shortDate(from)} – ${this.shortDate(to)}`;
  });

  /**
   * True when the read failed.
   *
   * Kept separate from an empty list because the two mean opposite things to a
   * driver: "no orders today" is information they can act on, and "we could not
   * ask" is not. Rendering both as an empty section would quietly tell them the
   * first when the second is true.
   */
  readonly ordersFailed = signal(false);

  ngOnInit() {
    if (!this.day.isLoaded()) {
      this.seedDay();
    } else if (this.day.needsGeography()) {
      this.healGeography();
    }
    this.loadOrders();
  }

  /**
   * Today's orders.
   *
   * Deliberately not folded into the day's seed: the stops come from
   * {@link VanJourneyService}, which is still a scaffold, and this is a live
   * ERP read. Keeping them separate means a failure here leaves the route — the
   * part the driver cannot work without — on screen and usable.
   */
  private loadOrders(done?: () => void) {
    this.today.set(toDateInput(new Date()));

    const from = fromDateInput(this.fromDate());
    const to = fromDateInput(this.toDate());
    if (!from || !to) {
      done?.();
      return;
    }

    // Only the newest read may write the list. Moving `From` and then `To`
    // fires two in quick succession, and if the first lands second the screen
    // shows one range's orders under the other range's heading — wrong in a
    // way that looks right.
    const request = ++this.ordersRequest;
    const current = () => request === this.ordersRequest;

    this.ordersLoading.set(true);
    this.ordersFailed.set(false);

    this.salesOrders.getOrdersForRange(from, to).subscribe({
      next: (res) => {
        if (!current()) return;
        const rows = res?.value ?? [];
        this.orders.set(rows);
        this.ordersTotal.set(res?.['@odata.count'] ?? rows.length);
        this.ordersLoading.set(false);
        done?.();
      },
      error: () => {
        if (!current()) return;
        this.orders.set([]);
        this.ordersTotal.set(0);
        this.ordersFailed.set(true);
        this.ordersLoading.set(false);
        done?.();
      },
    });
  }

  /** Sequence number of the most recent orders read. See {@link loadOrders}. */
  private ordersRequest = 0;

  retryOrders() {
    this.loadOrders();
  }

  /**
   * A new `From` date.
   *
   * Pushes `To` along when it would be left behind, so the range stays valid
   * as the driver moves the start back — the alternative is an error state
   * they have to fix before seeing anything.
   */
  setFromDate(input: HTMLInputElement) {
    const next = this.readDate(input, this.fromDate());
    if (!next || next === this.fromDate()) return;
    this.fromDate.set(next);
    if (next > this.toDate()) this.toDate.set(next);
    this.loadOrders();
  }

  setToDate(input: HTMLInputElement) {
    const next = this.readDate(input, this.toDate());
    if (!next || next === this.toDate()) return;
    this.toDate.set(next);
    if (next < this.fromDate()) this.fromDate.set(next);
    this.loadOrders();
  }

  /**
   * The date in a picker, putting the held value back if it was cleared.
   *
   * A native date field fires `change` with an empty string when the driver
   * clears it. Ignoring that alone leaves the field blank above a list still
   * showing the old range — and because the signal never changed, the `[value]`
   * binding has nothing to re-render, so it stays blank. Writing the held value
   * back to the element keeps the two agreeing.
   */
  private readDate(input: HTMLInputElement, held: string): string | null {
    const value = (input.value ?? '').slice(0, 10);
    if (!value) {
      input.value = held;
      return null;
    }
    return value;
  }

  /** Back to today — the view the screen opens on. */
  resetRange() {
    const today = toDateInput(new Date());
    this.today.set(today);
    if (this.fromDate() === today && this.toDate() === today) return;
    this.fromDate.set(today);
    this.toDate.set(today);
    this.loadOrders();
  }

  // ── Route actions ──────────────────────────────────────────────────────────

  /**
   * Switches how the remaining stops are ordered.
   *
   * Asks for the device's position the first time the driver leaves the planned
   * order, and not before: the permission prompt is only worth spending once
   * the answer changes something on screen. The reorder does not wait on the
   * fix — it runs from the best origin already known, and re-runs when a better
   * one arrives.
   */
  setRouteMode(mode: RouteMode) {
    if (mode === this.routeMode()) return;
    this.routeMode.set(mode);
    if (mode !== 'planned' && !this.position() && !this.locationDenied()) {
      this.locate();
    }
  }

  /**
   * Asks the device where it is and re-measures from there.
   *
   * Stays available after a fix has been taken. A position is a snapshot, and a
   * van moves all day: sequencing the afternoon's stops from where the driver
   * happened to be parked at the depot in the morning is worse than not
   * sequencing them at all, because it looks current.
   *
   * A failed refresh keeps the fix already held rather than dropping back to
   * the depot — a stale position beats a much staler one.
   */
  locate() {
    if (this.locating()) return;
    this.locating.set(true);

    this.location.getCurrent().subscribe((fix) => {
      if (fix) this.position.set(fix);
      this.locationDenied.set(fix === null);
      this.locating.set(false);
    });
  }

  private seedDay() {
    this.journey.loadToday().subscribe((day) => this.day.loadIfEmpty(day));
  }

  /**
   * Fills in coordinates for a day stored before stops carried them.
   *
   * The day itself is kept. It holds the round's progress — finished stops,
   * sales, collections, open invoices, and an outbox that may still be waiting
   * on D365 — and none of that is worth losing to a model change; only the
   * geography is missing, and the plan can supply it.
   */
  private healGeography() {
    this.journey.loadToday().subscribe((seed) => this.day.applyGeography(seed));
  }

  handleRefresh(event: CustomEvent) {
    const complete = () => (event.target as HTMLIonRefresherElement).complete();
    this.journey.loadToday().subscribe({
      next: (day) => {
        this.day.reset(day);
        complete();
      },
      error: complete,
    });
    this.loadOrders();
  }

  openVisit(visit: VanVisit) {
    if (visit.status === 'done') {
      this.toast(`${visit.name} — ${visit.outcome}`);
      return;
    }
    this.day.setCurrentVisit(visit.id);
    this.router.navigate(['/inventory/van-sales/visit', visit.id]);
  }

  newCustomer() {
    this.router.navigate(['/inventory/van-sales/new-customer']);
  }

  dayClose() {
    this.router.navigate(['/inventory/van-sales/day-close']);
  }

  // ── Presentation helpers ───────────────────────────────────────────────────

  /** The customer name on an order, falling back to the account when absent. */
  orderName(order: SalesOrderHeaderV3Response): string {
    return (
      order.SalesOrderName?.trim() ||
      order.OrderingCustomerAccountNumber ||
      order.SalesOrderNumber
    );
  }

  /**
   * When the order was created — `09:14` on a single day, `4 Mar 09:14` when
   * the range spans several.
   *
   * The time alone while the heading already names one day: a date on every
   * card would just repeat it. Once the list mixes days, the date is the part
   * that tells one card from the next, so it comes back.
   */
  orderTime(order: SalesOrderHeaderV3Response): string {
    const parsed = this.parse(order.OrderCreationDateTime);
    if (!parsed) return '';
    const time = parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return this.singleDay() ? time : `${this.shortDate(parsed)} ${time}`;
  }

  /**
   * The order's requested shipping date, short form.
   *
   * Returns '' rather than 'Invalid Date' for a missing or unparsable value —
   * a blank reads as "not set", which is true, where the browser's own string
   * for it reads as a bug.
   */
  orderDate(order: SalesOrderHeaderV3Response): string {
    const parsed = this.parse(order.RequestedShippingDate);
    return parsed ? this.shortDate(parsed) : '';
  }

  /** `4 Mar` — the short form used in headings and on cards. */
  private shortDate(date: Date): string {
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  private parse(raw: string | undefined): Date | null {
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  /** Pin colour on the schematic map: done, current, or upcoming. */
  pinColor(visit: VanVisit): string {
    if (visit.status === 'done') return 'var(--ion-color-success, #0e9f6e)';
    if (visit.status === 'current') return 'var(--gp-navy)';
    return '#94a6c8';
  }

  statusPill(visit: VanVisit): { label: string; color: string; bg: string } | null {
    if (visit.status === 'done') {
      return { label: visit.outcome ?? 'Done', color: '#0e6f4e', bg: '#e3f5ec' };
    }
    if (visit.status === 'current') {
      return { label: 'Current', color: '#1a3b6a', bg: '#e6eefb' };
    }
    if (visit.priority) {
      return { label: 'High priority', color: '#9a6a00', bg: '#fdf3d7' };
    }
    if (visit.mode === 'cod') {
      return { label: 'COD', color: '#4b5563', bg: '#eef0f3' };
    }
    return null;
  }

  subtitle(visit: VanVisit): string {
    if (visit.status === 'done') return visit.outcome ?? '';
    if (visit.status === 'current') {
      return `ETA ${visit.eta} · window ${visit.window || '—'} · balance ${this.round(visit.balance)}`;
    }
    return `ETA ${visit.eta}`;
  }

  /**
   * How far ahead a stop is: the drive to it, and the running total.
   *
   * Both, because they answer different questions — "is this one next door"
   * and "how much of the day is left" — and a driver reading a route wants
   * each at a glance. Empty for a stop already done.
   */
  distanceLabel(row: StopRow): string {
    if (row.km === null || row.cumulativeKm === null) return '';
    // On the first stop ahead the two are the same number; printing it twice
    // reads as a mistake.
    if (row.km === row.cumulativeKm) return this.formatKm(row.km);
    return `${this.formatKm(row.km)} · ${this.formatKm(row.cumulativeKm)} total`;
  }

  /**
   * A distance the way a driver says it: metres under a kilometre, otherwise km
   * to one decimal. `0.3 km` is a number to convert; `300 m` is a distance.
   */
  formatKm(km: number): string {
    if (!Number.isFinite(km)) return '';
    // Rounded to the nearest 10 m first, and the unit chosen from the rounded
    // value: a metre of precision on a straight-line estimate claims accuracy
    // this does not have, and picking the unit first renders anything just
    // under a kilometre as `1000 m`.
    const metres = Math.round((km * 1000) / 10) * 10;
    if (metres < 1000) return `${metres} m`;
    return `${(metres / 1000).toFixed(1)} km`;
  }

  private round(n: number): string {
    return Math.round(n).toLocaleString('en-US');
  }

  private async toast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 1600,
      position: 'top',
      color: 'medium',
    });
    await toast.present();
  }
}

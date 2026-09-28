import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ActionSheetController, ToastController } from '@ionic/angular';
import { firstValueFrom, of, timeout } from 'rxjs';
import { VanDayService } from '../../../../core/services/van-day.service';
import { DeviceLocationService } from '../../../../core/services/device-location.service';
import { FormatService } from '../../../../core';
import {
  TAX_DOC_LABEL,
  VanAction,
  VanApprovalService,
  VanDevToolsService,
  VanDocType,
  VanDocumentsService,
  VanRoleService,
  VanStoreService,
  VanTransactionsService,
  distanceMetres,
  taxDocKindFor,
} from '../../../../core/van-sales';

/** Reasons a driver can close a visit without a sale. */
const NO_SALE_REASONS = ['Closed', 'No cash', 'Well stocked', 'Other'];

/** Used when the rep setup has not loaded. Spec §4 default. */
const DEFAULT_GEOFENCE_M = 100;

const DOC_LABEL: Record<VanDocType, string> = {
  INVOICE: 'Invoice',
  ORDER: 'Order',
  RETURN: 'Return',
  RECEIPT: 'Collection',
  DELIVERY: 'Delivery',
};

/** What the check-in bottom sheet is explaining. */
type CheckInSheet = { kind: 'outside'; distance: number } | { kind: 'no-position' };

interface VisitAction {
  key: VanAction;
  label: string;
  icon: string;
  tone: string;
  badge?: string;
  disabled?: boolean;
  run: () => void;
}

/**
 * A single customer stop. The rep checks in inside the customer's geofence
 * (F13) — or with a supervisor's override — sees the customer's credit
 * position, then works the visit with the actions their role allows (§3).
 * Every action is gated on the check-in and on the day still being open.
 */
@Component({
  selector: 'app-van-visit',
  templateUrl: './van-visit.page.html',
  styleUrls: ['./van-visit.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanVisitPage implements OnInit {
  private readonly format = inject(FormatService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private actionSheetCtrl = inject(ActionSheetController);
  private location = inject(DeviceLocationService);
  private tx = inject(VanTransactionsService);
  private approvals = inject(VanApprovalService);
  private docs = inject(VanDocumentsService);
  private devTools = inject(VanDevToolsService);
  readonly store = inject(VanStoreService);
  readonly role = inject(VanRoleService);
  readonly day = inject(VanDayService);

  readonly visit = this.day.currentVisit;

  /** The van-sales customer record behind the stop. Absent on a day seeded before master data. */
  readonly customer = computed(() => {
    const v = this.visit();
    return v ? this.store.customer(v.account) : undefined;
  });

  readonly isCredit = computed(() => {
    const c = this.customer();
    return c ? c.paymentTerms === 'CREDIT' : this.visit()?.mode === 'credit';
  });

  readonly balance = computed(() => {
    const c = this.customer();
    return c ? this.store.balanceOf(c.id) : (this.visit()?.balance ?? 0);
  });

  readonly limit = computed(() => this.customer()?.creditLimit ?? this.visit()?.limit ?? 0);

  /** Headroom left on the account — what the rep can still sell on credit. */
  readonly available = computed(() => (this.isCredit() ? Math.max(0, this.limit() - this.balance()) : 0));

  /** Credit utilisation 0–1, for the progress bar. */
  readonly usage = computed(() => {
    const limit = this.limit();
    if (!this.isCredit() || !limit) return 0;
    return Math.min(1, this.balance() / limit);
  });

  readonly taxDocLabel = computed(() => {
    const c = this.customer();
    return c ? TAX_DOC_LABEL[taxDocKindFor(c, false)] : '';
  });

  /** Credit hold (e.g. a bounced cheque) or overdue invoices — shown as a banner. */
  readonly creditBanner = computed<{ title: string; detail: string } | null>(() => {
    const c = this.customer();
    if (!c) return null;
    if (c.creditHold) return { title: 'Credit hold', detail: c.holdReason || 'Credit sales are blocked.' };
    if (c.overdue) return { title: 'Overdue invoices', detail: 'Credit sales are blocked until the account is settled.' };
    return null;
  });

  // ── Check-in (F13) ─────────────────────────────────────────────────────────

  readonly checking = signal(false);
  readonly sheet = signal<CheckInSheet | null>(null);

  private readonly radius = computed(() => this.store.repSetup()?.geofenceRadiusM ?? DEFAULT_GEOFENCE_M);
  /** Off by default: location is recorded when available, never enforced. */
  readonly geofenceRequired = computed(() => this.store.repSetup()?.geofenceRequired ?? false);

  // Overrides only mean something while the geofence is enforced. A request
  // raised before it was made optional must not keep the visit locked.
  readonly overridePending = computed(() => {
    const v = this.visit();
    return v && this.geofenceRequired() ? this.approvals.pending(v.account, 'GEOFENCE_OVERRIDE') : undefined;
  });

  readonly overrideApproved = computed(() => {
    const v = this.visit();
    return v && this.geofenceRequired() ? this.approvals.approved(v.account, 'GEOFENCE_OVERRIDE') : undefined;
  });

  /** Checked in through an override earlier today — a re-check-in needs no second approval. */
  private readonly overriddenToday = computed(() => {
    const v = this.visit();
    return !!v && this.store.local().geofenceOverrides.includes(v.account);
  });

  /** Visit actions are closed: not checked in, or the day is closed. */
  readonly locked = computed(() => !this.visit()?.checkedIn || this.store.dayClosed());

  // ── Actions ────────────────────────────────────────────────────────────────

  private readonly readyOrders = computed(() => {
    const v = this.visit();
    if (!v) return [];
    return this.store.orders().filter((o) => o.customerId === v.account && o.status === 'READY');
  });

  private readonly surveyed = computed(() => {
    const v = this.visit();
    return !!v && this.store.local().surveyed.includes(v.account);
  });

  readonly actions = computed<VisitAction[]>(() => {
    const v = this.visit();
    if (!v) return [];
    // Read so the grid rebuilds when the role changes.
    this.role.role();
    const ready = this.readyOrders().length;
    const all: VisitAction[] = [
      { key: 'SELL', label: 'Sell / Invoice', icon: 'receipt-outline', tone: 'sell', run: () => this.go(['sell', v.id]) },
      {
        key: 'TAKE_ORDER',
        label: 'Take order',
        icon: 'clipboard-outline',
        tone: 'order',
        run: () => this.go(['sell', v.id], { mode: 'order' }),
      },
      {
        key: 'DELIVER',
        label: 'Deliver',
        icon: 'cube-outline',
        tone: 'deliver',
        badge: ready ? String(ready) : undefined,
        disabled: ready === 0,
        run: () => this.deliver(),
      },
      {
        key: 'COLLECT',
        label: 'Collect',
        icon: 'cash-outline',
        tone: 'collect',
        disabled: this.balance() <= 0,
        run: () => this.go(['collect', v.id]),
      },
      { key: 'RETURN', label: 'Return', icon: 'arrow-undo-outline', tone: 'return', run: () => this.go(['return', v.id]) },
      {
        key: 'SURVEY',
        label: 'Survey',
        icon: 'list-outline',
        tone: 'survey',
        badge: this.surveyed() ? 'Done' : undefined,
        run: () => this.go(['survey', v.id]),
      },
      { key: 'NO_SALE', label: 'No sale', icon: 'close-circle-outline', tone: 'nosale', run: () => void this.endWithoutSale() },
    ];
    return all.filter((a) => this.role.can(a.key));
  });

  /** Today's documents for this customer, newest first. */
  readonly todaysDocs = computed(() => {
    const v = this.visit();
    if (!v) return [];
    return this.docs
      .todays()
      .filter((d) => d.customerId === v.account)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  ngOnInit() {
    // A deep link or a reload lands here without a current visit set — resolve it
    // from the route id against the loaded day.
    if (!this.visit()) {
      const id = Number(this.route.snapshot.paramMap.get('id'));
      if (Number.isFinite(id)) this.day.setCurrentVisit(id);
    }
    if (!this.visit()) {
      this.router.navigate(['/inventory/van-sales']);
    }
  }

  ionViewWillEnter() {
    const v = this.visit();
    if (v) void this.tx.refreshCustomer(v.account);
  }

  /**
   * Checks in. With the geofence optional (the default), the rep is always let
   * in and the position is only recorded — with its distance to the customer
   * when both are known. With it required, the rep must be within the fence;
   * a customer with no coordinates cannot be fenced, so that check-in is
   * allowed.
   */
  async checkIn() {
    const v = this.visit();
    if (!v || this.checking()) return;
    if (!this.geofenceRequired()) {
      await this.checkInWithoutFence();
      return;
    }
    if (this.overriddenToday()) {
      this.completeCheckIn({ Override: true });
      return;
    }

    const c = this.customer();
    const target = c && c.lat != null && c.lon != null ? { lat: c.lat, lng: c.lon } : null;
    const skip = this.devTools.enabled && this.devTools.atCustomer();

    if (!target && !skip) {
      this.completeCheckIn({ Lat: null, Lon: null, DistanceM: null, NoCustomerGeo: true });
      return;
    }

    this.checking.set(true);
    const position = await firstValueFrom(this.location.getCurrent());
    this.checking.set(false);

    if (skip) {
      this.completeCheckIn({ Lat: position?.lat ?? null, Lon: position?.lng ?? null, DistanceM: 0 });
      return;
    }
    if (!position) {
      this.sheet.set({ kind: 'no-position' });
      return;
    }

    const distance = distanceMetres(position, target!);
    if (distance <= this.radius()) {
      this.completeCheckIn({ Lat: position.lat, Lon: position.lng, DistanceM: distance });
      return;
    }
    this.tx.logVisit('CheckInRejected', v.account, {
      Lat: position.lat,
      Lon: position.lng,
      DistanceM: distance,
      RadiusM: this.radius(),
    });
    this.sheet.set({ kind: 'outside', distance });
  }

  private async checkInWithoutFence() {
    const c = this.customer();
    const target = c && c.lat != null && c.lon != null ? { lat: c.lat, lng: c.lon } : null;
    // Location is only recorded here, so the rep waits a few seconds at most.
    this.checking.set(true);
    const position = await firstValueFrom(
      this.location.getCurrent().pipe(timeout({ first: 3000, with: () => of(null) }))
    );
    this.checking.set(false);
    const distance = position && target ? distanceMetres(position, target) : null;
    this.completeCheckIn({
      Lat: position?.lat ?? null,
      Lon: position?.lng ?? null,
      DistanceM: distance,
      OutsideGeofence: distance !== null && distance > this.radius(),
      GeofenceRequired: false,
    });
  }

  requestOverride() {
    const v = this.visit();
    const s = this.sheet();
    if (!v || this.overridePending()) return;
    const detail =
      s?.kind === 'outside'
        ? `Check-in ${this.metres(s.distance)} from customer`
        : 'Check-in without a GPS position';
    this.approvals.request('GEOFENCE_OVERRIDE', v.account, detail, {
      distance: s?.kind === 'outside' ? s.distance : null,
    });
    this.sheet.set(null);
    this.toast('Override requested — waiting for your supervisor', 'medium');
  }

  checkInWithOverride() {
    const v = this.visit();
    const approval = this.overrideApproved();
    if (!v || !approval) return;
    const distance = (approval.payload as { distance?: number | null } | null)?.distance ?? null;
    this.tx.logVisit('GeofenceOverride', v.account, { ApprovalId: approval.id, DistanceM: distance });
    this.approvals.consume(approval.id);
    this.store.mutateLocal((d) => ({
      ...d,
      geofenceOverrides: [...new Set([...d.geofenceOverrides, v.account])],
    }));
    this.completeCheckIn({ ApprovalId: approval.id, DistanceM: distance });
  }

  private completeCheckIn(extra: Record<string, unknown>) {
    const v = this.visit();
    if (!v) return;
    this.day.checkIn(v.id);
    this.tx.logVisit('CheckIn', v.account, extra);
    this.sheet.set(null);
    this.toast('Checked in', 'success');
  }

  closeSheet() {
    this.sheet.set(null);
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  runAction(a: VisitAction) {
    if (this.locked() || a.disabled) return;
    a.run();
  }

  private go(path: (string | number)[], queryParams?: Record<string, string>) {
    this.router.navigate(['/inventory/van-sales', ...path], queryParams ? { queryParams } : undefined);
  }

  private deliver() {
    const ready = this.readyOrders();
    if (ready.length === 1) this.go(['deliver', ready[0].salesId]);
    else this.go(['deliveries']);
  }

  openDoc(id: string) {
    this.go(['receipt', id]);
  }

  async endWithoutSale() {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Close visit without a sale',
      buttons: [
        ...NO_SALE_REASONS.map((reason) => ({
          text: reason,
          handler: () => this.confirmNoSale(reason),
        })),
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private confirmNoSale(reason: string) {
    const v = this.visit();
    if (!v) return;
    this.day.noSale(reason);
    this.tx.logVisit('NoSale', v.account, { Reason: reason });
    this.toast(`Visit closed — ${reason}`, 'medium');
    this.router.navigate(['/inventory/van-sales']);
  }

  // ── Presentation ───────────────────────────────────────────────────────────

  docLabel(type: VanDocType): string {
    return DOC_LABEL[type];
  }

  docTime(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : this.format.time(d);
  }

  metres(m: number): string {
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
  }

  round(n: number): string {
    return this.format.number(Math.round(n));
  }

  private async toast(message: string, color: 'success' | 'medium') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 1800,
      position: 'top',
      color,
    });
    await toast.present();
  }
}

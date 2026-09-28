import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { FormatService } from '../../../../core';
import {
  allowedNext,
  ApprovalRequest,
  ApprovalType,
  ChequeRecord,
  ChequeStatus,
  EDocStatus,
  localIsoDate,
  TAX_DOC_LABEL,
  TaxDocKind,
  VanApprovalService,
  VanDocumentsService,
  VanSalesApiRouter,
  VanStoreService,
} from '../../../../core/van-sales';

type SupTab = 'approvals' | 'cheques' | 'edocs';
type EDocFilter = 'ALL' | EDocStatus;

interface Pill {
  label: string;
  color: string;
  bg: string;
}

const APPROVAL_LABEL: Record<ApprovalType, string> = {
  EXTRA_DISCOUNT: 'Extra discount',
  CREDIT_OVERRIDE: 'Credit override',
  FREE_RETURN: 'Free return',
  GEOFENCE_OVERRIDE: 'Geofence override',
};

const CHEQUE_PILL: Record<ChequeStatus, Pill> = {
  WITH_REP: { label: 'With rep', color: '#1d4ed8', bg: '#e8effd' },
  HANDED_TO_TREASURY: { label: 'Handed to treasury', color: '#6d28d9', bg: '#f1eafd' },
  DEPOSITED: { label: 'Deposited', color: '#9a6a00', bg: '#fdf3d7' },
  CLEARED: { label: 'Cleared', color: '#0e6f4e', bg: '#e3f5ec' },
  BOUNCED: { label: 'Bounced', color: '#b42318', bg: '#fdecea' },
};

const CHEQUE_ACTION: Record<ChequeStatus, string> = {
  WITH_REP: '',
  HANDED_TO_TREASURY: 'Mark handed to treasury',
  DEPOSITED: 'Mark deposited',
  CLEARED: 'Mark cleared',
  BOUNCED: 'Mark bounced',
};

const EDOC_PILL: Record<EDocStatus, Pill> = {
  QUEUED: { label: 'Queued', color: '#475467', bg: '#eef0f3' },
  SUBMITTED: { label: 'Submitted', color: '#9a6a00', bg: '#fdf3d7' },
  VALID: { label: 'Valid', color: '#0e6f4e', bg: '#e3f5ec' },
  REJECTED: { label: 'Rejected', color: '#b42318', bg: '#fdecea' },
  NOT_REQUIRED: { label: 'Not required', color: '#475467', bg: '#eef0f3' },
};

const APPROVAL_PILL: Record<ApprovalRequest['status'], Pill> = {
  PENDING: { label: 'Pending', color: '#9a6a00', bg: '#fdf3d7' },
  APPROVED: { label: 'Approved', color: '#0e6f4e', bg: '#e3f5ec' },
  REJECTED: { label: 'Rejected', color: '#b42318', bg: '#fdecea' },
};

interface TimelineStep {
  label: string;
  reached: boolean;
  at?: string;
  bad?: boolean;
}

/**
 * Supervisor (spec §7.10, F1, F6, F7): approve or reject rep requests, walk
 * cheques through their lifecycle, and watch e-document status.
 *
 * The backend is the source of truth for a bounce (spec §7.10); the local
 * credit hold only mirrors it so this device reflects it before the next pull.
 */
@Component({
  selector: 'app-van-supervisor',
  templateUrl: './van-supervisor.page.html',
  styleUrls: ['./van-supervisor.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanSupervisorPage {
  private readonly format = inject(FormatService);
  private readonly toastCtrl = inject(ToastController);
  private readonly alertCtrl = inject(AlertController);
  private readonly api = inject(VanSalesApiRouter);
  private readonly approvals = inject(VanApprovalService);
  private readonly docs = inject(VanDocumentsService);
  private readonly store = inject(VanStoreService);

  readonly tab = signal<SupTab>('approvals');
  readonly loadingApprovals = signal(false);
  readonly loadingCheques = signal(false);
  readonly refreshingEDocs = signal(false);
  /** Approval id or cheque key currently being written. */
  readonly busy = signal<string | null>(null);

  readonly cheques = signal<ChequeRecord[]>([]);
  readonly eDocFilter = signal<EDocFilter>('ALL');

  readonly approvalList = computed(() =>
    [...this.approvals.all()].sort((a, b) => {
      const p = Number(b.status === 'PENDING') - Number(a.status === 'PENDING');
      return p || b.createdAt.localeCompare(a.createdAt);
    })
  );
  readonly pendingCount = computed(() => this.approvals.allPending().length);

  readonly chequeList = computed(() => {
    const rank = (s: ChequeStatus) => (s === 'CLEARED' || s === 'BOUNCED' ? 1 : 0);
    return [...this.cheques()].sort((a, b) => rank(a.status) - rank(b.status) || a.dueDate.localeCompare(b.dueDate));
  });

  readonly eDocFilters: { value: EDocFilter; label: string }[] = [
    { value: 'ALL', label: 'All' },
    { value: 'QUEUED', label: 'Queued' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'VALID', label: 'Valid' },
    { value: 'REJECTED', label: 'Rejected' },
  ];

  readonly eDocList = computed(() => {
    const f = this.eDocFilter();
    return this.docs
      .eDocs()
      .filter((d) => f === 'ALL' || d.eDocStatus === f)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  ionViewWillEnter(): void {
    void this.store.ensureLoaded();
    void this.loadApprovals();
    void this.loadCheques();
  }

  async onRefresh(ev: CustomEvent): Promise<void> {
    try {
      if (this.tab() === 'approvals') await this.loadApprovals();
      else if (this.tab() === 'cheques') await this.loadCheques();
      else await this.refreshEDocs();
    } finally {
      await (ev.target as HTMLIonRefresherElement).complete();
    }
  }

  // ── Approvals ────────────────────────────────────────────────────────────

  async loadApprovals(): Promise<void> {
    this.loadingApprovals.set(true);
    try {
      await this.approvals.refreshAll();
    } catch {
      await this.toast("Couldn't load approvals. Check the connection.", 'danger');
    } finally {
      this.loadingApprovals.set(false);
    }
  }

  async decide(a: ApprovalRequest, status: 'APPROVED' | 'REJECTED'): Promise<void> {
    if (this.busy()) return;
    this.busy.set(a.id);
    try {
      await this.approvals.decide(a.id, status);
      await this.toast(status === 'APPROVED' ? 'Approved' : 'Rejected', status === 'APPROVED' ? 'success' : 'medium');
    } catch (e) {
      await this.toast(this.message(e, "Couldn't save the decision."), 'danger');
    } finally {
      this.busy.set(null);
    }
  }

  approvalLabel(t: ApprovalType): string {
    return APPROVAL_LABEL[t];
  }

  approvalPill(s: ApprovalRequest['status']): Pill {
    return APPROVAL_PILL[s];
  }

  customerName(a: ApprovalRequest): string {
    return a.customerName ?? this.store.customer(a.customerId)?.name ?? a.customerId;
  }

  // ── Cheques ──────────────────────────────────────────────────────────────

  async loadCheques(): Promise<void> {
    this.loadingCheques.set(true);
    try {
      this.cheques.set(await firstValueFrom(this.api.listCheques()));
    } catch {
      await this.toast("Couldn't load cheques. Check the connection.", 'danger');
    } finally {
      this.loadingCheques.set(false);
    }
  }

  chequeKey(c: ChequeRecord): string {
    return `${c.receiptId}|${c.bank}|${c.number}`;
  }

  chequeCustomer(c: ChequeRecord): string {
    return this.store.customer(c.customerId)?.name ?? c.customerId;
  }

  chequePill(s: ChequeStatus): Pill {
    return CHEQUE_PILL[s];
  }

  nextSteps(c: ChequeRecord): { status: ChequeStatus; label: string }[] {
    return allowedNext(c.status).map((status) => ({ status, label: CHEQUE_ACTION[status] }));
  }

  timeline(c: ChequeRecord): TimelineStep[] {
    const at = (s: ChequeStatus) => [...c.history].reverse().find((h) => h.status === s)?.at;
    const order: ChequeStatus[] = ['WITH_REP', 'HANDED_TO_TREASURY', 'DEPOSITED'];
    const reachedIdx = order.indexOf(c.status);
    const final = c.status === 'CLEARED' || c.status === 'BOUNCED';
    const steps: TimelineStep[] = order.map((s, i) => ({
      label: CHEQUE_PILL[s].label,
      reached: final || i <= reachedIdx,
      at: at(s) ?? (s === 'WITH_REP' ? c.history[0]?.at : undefined),
    }));
    steps.push(
      final
        ? { label: CHEQUE_PILL[c.status].label, reached: true, at: at(c.status), bad: c.status === 'BOUNCED' }
        : { label: 'Cleared / Bounced', reached: false }
    );
    return steps;
  }

  async advance(c: ChequeRecord, status: ChequeStatus): Promise<void> {
    if (this.busy()) return;
    if (status === 'BOUNCED') {
      const alert = await this.alertCtrl.create({
        header: 'Mark bounced?',
        message: `${c.bank} ${c.number} · ${this.money(c.amount)}. The customer goes on credit hold and the amount returns to their balance.`,
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          { text: 'Mark bounced', role: 'confirm' },
        ],
      });
      await alert.present();
      if ((await alert.onDidDismiss()).role !== 'confirm') return;
    }

    this.busy.set(this.chequeKey(c));
    try {
      await firstValueFrom(this.api.updateChequeStatus(c.receiptId, c.number, c.bank, status));
      if (status === 'BOUNCED') this.reflectBounce(c);
      await this.loadCheques();
      await this.toast(status === 'BOUNCED' ? 'Customer put on credit hold' : CHEQUE_PILL[status].label, status === 'BOUNCED' ? 'medium' : 'success');
    } catch (e) {
      await this.toast(this.message(e, "Couldn't update the cheque."), 'danger');
    } finally {
      this.busy.set(null);
    }
  }

  /** Mirrors the backend's bounce handling on this device until the next pull. */
  private reflectBounce(c: ChequeRecord): void {
    this.store.patchCustomer(c.customerId, (cust) => ({
      ...cust,
      creditHold: true,
      holdReason: `Bounced cheque ${c.number} (${c.bank})`,
      openInvoices: [...cust.openInvoices, { invoiceId: `BNC-${c.number}`, date: localIsoDate(), amount: c.amount }],
    }));
    this.docs.setChequeStatus(
      (r) => r.receiptId === c.receiptId && r.number === c.number && r.bank === c.bank && r.status !== 'BOUNCED',
      'BOUNCED'
    );
  }

  // ── E-documents ──────────────────────────────────────────────────────────

  async refreshEDocs(): Promise<void> {
    this.refreshingEDocs.set(true);
    try {
      await this.docs.refreshEDocStatus();
    } finally {
      this.refreshingEDocs.set(false);
    }
  }

  eDocPill(s: EDocStatus): Pill {
    return EDOC_PILL[s];
  }

  kindLabel(k: TaxDocKind | undefined): string {
    return k ? TAX_DOC_LABEL[k] : '';
  }

  shortUuid(uuid: string | undefined): string {
    return uuid ? `${uuid.slice(0, 8)}…` : '—';
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  money(n: number): string {
    return this.format.number(n, 2, 2);
  }

  date(iso: string): string {
    return this.format.date(iso);
  }

  dateTime(iso: string | undefined): string {
    return iso ? this.format.dateTime(iso) : '';
  }

  private message(e: unknown, fallback: string): string {
    return e instanceof Error && e.message ? e.message : fallback;
  }

  private async toast(message: string, color: 'success' | 'danger' | 'medium'): Promise<void> {
    const t = await this.toastCtrl.create({
      message,
      duration: color === 'danger' ? 3000 : 1800,
      position: 'top',
      color,
    });
    await t.present();
  }
}

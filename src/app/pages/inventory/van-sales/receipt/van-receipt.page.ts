import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { toDataURL } from 'qrcode';
import { FormatService } from '../../../../core';
import { PortalSessionStore } from '../../../../core/auth';
import { VanDayService } from '../../../../core/services/van-day.service';
import {
  EDocStatus,
  TAX_DOC_LABEL,
  VanAttachmentService,
  VanDocumentsService,
  VanStoreService,
} from '../../../../core/van-sales';
import { VanPrinterService } from '../shared-print/van-printer.service';
import { VanReceiptPdfService } from '../shared-print/van-receipt-pdf.service';
import {
  DISPOSITION_LABEL,
  DOC_TYPE_LABEL,
  EDOC_STATUS_LABEL,
  METHOD_LABEL,
  ReceiptContext,
  stamp,
} from '../shared-print/van-receipt-layout';

const EDOC_PILL: Record<EDocStatus, { color: string; bg: string }> = {
  QUEUED: { color: '#4b5563', bg: '#eef0f3' },
  SUBMITTED: { color: '#1a3b6a', bg: '#e6eefb' },
  VALID: { color: '#0e6f4e', bg: '#e3f5ec' },
  REJECTED: { color: '#b42318', bg: '#fdecec' },
  NOT_REQUIRED: { color: '#4b5563', bg: '#eef0f3' },
};

/**
 * The paper copy of any van document — invoice, order, return, collection,
 * delivery (spec §7.8). Re-openable after the fact, re-printable, shareable as
 * PDF, and the place the rep sees the e-document status and QR once the tax
 * authority validates it.
 */
@Component({
  selector: 'app-van-receipt',
  templateUrl: './van-receipt.page.html',
  styleUrls: ['./van-receipt.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanReceiptPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly format = inject(FormatService);
  private readonly session = inject(PortalSessionStore);
  private readonly day = inject(VanDayService);
  private readonly attachments = inject(VanAttachmentService);
  private readonly printer = inject(VanPrinterService);
  private readonly pdf = inject(VanReceiptPdfService);
  readonly docs = inject(VanDocumentsService);
  readonly store = inject(VanStoreService);

  private readonly docId = signal('');
  readonly doc = computed(() => this.docs.get(this.docId()));
  readonly rep = this.store.repSetup;
  readonly company = computed(() => this.session.workspaceName());

  readonly qrDataUrl = signal<string | null>(null);
  readonly signatureUrl = signal<string | null>(null);
  readonly printing = signal(false);
  readonly sharing = signal(false);
  private qrFor = '';

  readonly typeLabel = DOC_TYPE_LABEL;
  readonly methodLabel = METHOD_LABEL;
  readonly dispositionLabel = DISPOSITION_LABEL;
  readonly taxDocLabel = TAX_DOC_LABEL;
  readonly eDocLabel = EDOC_STATUS_LABEL;
  readonly eDocPill = EDOC_PILL;

  /** Back to the stop the document belongs to, if that stop is still the current one. */
  readonly visitLink = computed(() => {
    const v = this.day.currentVisit();
    const d = this.doc();
    return v && d && v.account === d.customerId ? ['/inventory/van-sales/visit', String(v.id)] : ['/inventory/van-sales'];
  });

  ngOnInit(): void {
    this.docId.set(this.route.snapshot.paramMap.get('docId') ?? '');
    void this.loadExtras();
  }

  ionViewWillEnter(): void {
    void this.refresh();
  }

  async onRefresh(ev: CustomEvent): Promise<void> {
    await this.refresh();
    (ev.target as HTMLIonRefresherElement).complete();
  }

  private async refresh(): Promise<void> {
    await this.docs.refreshEDocStatus();
    await this.renderQr();
  }

  private async loadExtras(): Promise<void> {
    await this.renderQr();
    const d = this.doc();
    if (d?.signatureId) this.signatureUrl.set(await this.attachments.read(d.signatureId));
  }

  /** Only ever from the middleware's payload — never a locally made-up QR. */
  private async renderQr(): Promise<void> {
    const payload = this.doc()?.qrPayload;
    if (!payload) {
      this.qrDataUrl.set(null);
      return;
    }
    if (payload === this.qrFor && this.qrDataUrl()) return;
    try {
      this.qrDataUrl.set(await toDataURL(payload, { margin: 1, width: 360, errorCorrectionLevel: 'M' }));
      this.qrFor = payload;
    } catch {
      this.qrDataUrl.set(null);
    }
  }

  private context(): ReceiptContext {
    return { company: this.company(), rep: this.rep(), currency: this.store.currency() };
  }

  async print(): Promise<void> {
    const d = this.doc();
    if (!d || this.printing()) return;
    this.printing.set(true);
    try {
      if (!this.printer.connected()) void this.toast('Printer not connected — sharing the receipt text instead', 'medium');
      const outcome = await this.printer.print(d, this.context());
      if (outcome === 'PRINTED') void this.toast('Printed', 'success');
      if (outcome === 'DOWNLOADED') void this.toast('Receipt saved as text', 'medium');
    } catch (e) {
      void this.toast(e instanceof Error ? e.message : 'Could not print', 'danger');
    } finally {
      this.printing.set(false);
    }
  }

  async sharePdf(): Promise<void> {
    const d = this.doc();
    if (!d || this.sharing()) return;
    this.sharing.set(true);
    try {
      const outcome = await this.pdf.share(d, this.context(), this.qrDataUrl());
      if (outcome === 'DOWNLOADED') void this.toast('PDF downloaded', 'success');
    } catch (e) {
      void this.toast(e instanceof Error ? e.message : 'Could not create the PDF', 'danger');
    } finally {
      this.sharing.set(false);
    }
  }

  backToVisit(): void {
    this.router.navigate(this.visitLink());
  }

  nextStop(): void {
    this.router.navigate(['/inventory/van-sales']);
  }

  money(n: number): string {
    return this.format.number(n, 2, 2);
  }

  num(n: number): string {
    return this.format.number(n);
  }

  when(iso: string): string {
    return stamp(iso);
  }

  private async toast(message: string, color: 'success' | 'medium' | 'danger'): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 2200, position: 'top', color });
    await t.present();
  }
}

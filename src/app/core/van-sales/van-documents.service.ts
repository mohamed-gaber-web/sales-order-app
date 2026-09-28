import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { VanOutboxService } from './van-outbox.service';
import { VanSalesApiRouter } from './van-sales-api.router';
import { ChequeRecord, ChequeStatus, EDocStatus, OutboxItem, VanDocument } from './van-sales.models';
import { VanStoreService } from './van-store.service';
import { localIsoDate } from './van-uuid';

const DOCS_KEY = 'gp.vanSales.documents';
const CHEQUES_KEY = 'gp.vanSales.cheques';
const COUNTERS_KEY = 'gp.vanSales.counters';

export type DocSeq = 'invoice' | 'order' | 'return' | 'receipt';

/** Outbox calls whose acceptance moves a tax document out of "Queued". */
const TAX_POSTING_APIS = new Set([25, 26, 27, 28, 43]);

/**
 * Documents the rep has issued on this device, their numbering, the tax
 * document status of each, and the cheques the rep is carrying.
 *
 * Numbers come from the rep's reserved sequence (#12 prefixes) plus a local
 * counter kept per device across days (spec §9), so a document printed
 * offline already carries the number D365 will file it under.
 */
@Injectable({ providedIn: 'root' })
export class VanDocumentsService {
  private readonly store = inject(VanStoreService);
  private readonly outbox = inject(VanOutboxService);
  private readonly api = inject(VanSalesApiRouter);

  private readonly _docs = signal<VanDocument[]>(read(DOCS_KEY, []));
  private readonly _cheques = signal<ChequeRecord[]>(read(CHEQUES_KEY, []));

  readonly documents = this._docs.asReadonly();
  readonly todays = computed(() => this._docs().filter((d) => d.createdAt.slice(0, 10) === localIsoDate()));
  /** Cheques this rep holds (not yet handed over), for the day-close hand-over. */
  readonly chequesInHand = computed(() => this._cheques().filter((c) => c.status === 'WITH_REP'));
  readonly cheques = this._cheques.asReadonly();
  readonly eDocs = computed(() => this._docs().filter((d) => d.taxDocKind));
  readonly eDocsWaiting = computed(() => this.eDocs().filter((d) => d.eDocStatus === 'QUEUED' || d.eDocStatus === 'SUBMITTED'));

  constructor() {
    this.outbox.posted$.subscribe((item) => this.onPosted(item));
  }

  nextNumber(seq: DocSeq): string {
    const prefix = this.store.repSetup()?.docNumberSeqPrefix[seq] ?? `${seq.toUpperCase()}-`;
    const counters = read<Record<string, number>>(COUNTERS_KEY, {});
    const n = (counters[prefix] ?? 0) + 1;
    counters[prefix] = n;
    write(COUNTERS_KEY, counters);
    return `${prefix}${String(n).padStart(4, '0')}`;
  }

  add(doc: VanDocument): void {
    this.saveDocs([doc, ...this._docs()]);
  }

  get(id: string): VanDocument | undefined {
    return this._docs().find((d) => d.id === id);
  }

  patch(id: string, patch: Partial<VanDocument>): void {
    this.saveDocs(this._docs().map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  addCheques(records: ChequeRecord[]): void {
    this.saveCheques([...this._cheques(), ...records]);
  }

  setChequeStatus(match: (c: ChequeRecord) => boolean, status: ChequeStatus): void {
    const at = new Date().toISOString();
    this.saveCheques(
      this._cheques().map((c) => (match(c) ? { ...c, status, history: [...c.history, { status, at }] } : c))
    );
  }

  /** Asks the e-invoicing side for news on every document still waiting. */
  async refreshEDocStatus(): Promise<void> {
    const waiting = this._docs().filter((d) => d.etaUuid && d.eDocStatus === 'SUBMITTED');
    if (!waiting.length) return;
    try {
      const results = await firstValueFrom(this.api.getEDocStatus(waiting.map((d) => d.etaUuid!)));
      for (const r of results) {
        const doc = waiting.find((d) => d.etaUuid === r.uuid);
        if (doc) this.patch(doc.id, { eDocStatus: r.status, qrPayload: r.qrPayload ?? doc.qrPayload });
      }
    } catch {
      // Stays "Submitted"; the next refresh tries again.
    }
  }

  private onPosted(item: OutboxItem): void {
    if (!TAX_POSTING_APIS.has(item.apiNo)) return;
    const body = item.body as Record<string, unknown>;
    const doc = this._docs().find(
      (d) => d.mobileTransId === item.mobileTransId || (item.apiNo === 43 && d.etaUuid === body['uuid'])
    );
    if (!doc || !doc.taxDocKind) return;
    // E-receipts are only submitted once #43 posts; the parent posting alone is not enough.
    if ((doc.taxDocKind === 'E_RECEIPT' || doc.taxDocKind === 'E_RECEIPT_RETURN') && item.apiNo !== 43) return;
    if (doc.eDocStatus === 'QUEUED') {
      this.patch(doc.id, { eDocStatus: 'SUBMITTED' as EDocStatus });
      void this.refreshEDocStatus();
    }
  }

  private saveDocs(docs: VanDocument[]): void {
    this._docs.set(docs);
    write(DOCS_KEY, docs.slice(0, 400));
  }

  private saveCheques(list: ChequeRecord[]): void {
    this._cheques.set(list);
    write(CHEQUES_KEY, list);
  }
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Session only.
  }
}

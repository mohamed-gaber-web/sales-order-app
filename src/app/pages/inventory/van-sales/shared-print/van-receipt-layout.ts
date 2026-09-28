import {
  Disposition,
  EDocStatus,
  PaymentMethod,
  RepSetup,
  TAX_DOC_LABEL,
  VanDocType,
  VanDocument,
} from '../../../../core/van-sales';

/**
 * One receipt, described once as rows, then drawn twice: as fixed-width text
 * for a thermal printer (32 or 48 columns) and onto a canvas for the PDF.
 * Keeping a single layout means the paper copy, the PDF and the screen never
 * disagree about what a document said.
 */
export type ReceiptRow =
  | { kind: 'center'; text: string; bold?: boolean }
  | { kind: 'pair'; left: string; right: string; bold?: boolean }
  | { kind: 'text'; text: string; muted?: boolean }
  | { kind: 'rule' }
  | { kind: 'gap' };

export interface ReceiptContext {
  company: string;
  rep: RepSetup | null;
  currency: string;
}

export const DOC_TYPE_LABEL: Record<VanDocType, string> = {
  INVOICE: 'Sales invoice',
  ORDER: 'Sales order',
  RETURN: 'Return',
  RECEIPT: 'Collection receipt',
  DELIVERY: 'Delivery invoice',
};

export const EDOC_STATUS_LABEL: Record<EDocStatus, string> = {
  QUEUED: 'Queued',
  SUBMITTED: 'Submitted',
  VALID: 'Valid',
  REJECTED: 'Rejected',
  NOT_REQUIRED: 'Not required',
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  PDC: 'Cheque',
  E_WALLET: 'E-wallet',
};

export const DISPOSITION_LABEL: Record<Disposition, string> = {
  RESTOCK: 'Back to van stock',
  QUARANTINE: 'Quarantine',
  SCRAP: 'Scrap',
};

/** Latin digits on paper: thermal printers rarely carry Arabic-Indic glyphs. */
const MONEY = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const QTY = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function money(n: number): string {
  return MONEY.format(n);
}

export function qty(n: number): string {
  return QTY.format(n);
}

export function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function buildReceiptRows(doc: VanDocument, ctx: ReceiptContext): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  const cur = ctx.currency ? ` ${ctx.currency}` : '';

  rows.push({ kind: 'center', text: ctx.company || 'Van sales', bold: true });
  if (ctx.rep) {
    rows.push({ kind: 'center', text: `Rep ${ctx.rep.workerName} · Van ${ctx.rep.vanWarehouse}` });
    if (ctx.rep.deviceSerial) rows.push({ kind: 'center', text: `POS ${ctx.rep.deviceSerial}` });
  }
  rows.push({ kind: 'rule' });
  rows.push({ kind: 'center', text: DOC_TYPE_LABEL[doc.type].toUpperCase(), bold: true });
  rows.push({ kind: 'center', text: doc.id });
  rows.push({ kind: 'pair', left: 'Date', right: stamp(doc.createdAt) });
  rows.push({ kind: 'pair', left: 'Customer', right: doc.customerId });
  rows.push({ kind: 'text', text: doc.customerName });
  if (doc.payMode) rows.push({ kind: 'pair', left: 'Payment', right: doc.payMode === 'CASH' ? 'Cash' : 'Credit' });

  if (doc.lines.length) {
    rows.push({ kind: 'rule' });
    for (const l of doc.lines) {
      rows.push({ kind: 'text', text: l.name });
      rows.push({ kind: 'pair', left: `  ${qty(l.qty)} x ${money(l.unitPrice)}`, right: money(l.net) });
      if (l.lineDiscount > 0) rows.push({ kind: 'pair', left: '  Discount', right: `-${money(l.lineDiscount)}` });
      if (l.freeQty > 0) rows.push({ kind: 'text', text: `  + ${qty(l.freeQty)} free`, muted: true });
      if (l.promoLabel) rows.push({ kind: 'text', text: `  ${l.promoLabel}`, muted: true });
    }
  }

  if (doc.type === 'RECEIPT') {
    rows.push({ kind: 'rule' });
    if (doc.paymentMethod) rows.push({ kind: 'pair', left: 'Method', right: METHOD_LABEL[doc.paymentMethod] });
    if (doc.walletRef) rows.push({ kind: 'pair', left: 'Wallet ref', right: doc.walletRef });
    for (const c of doc.cheques ?? []) {
      rows.push({ kind: 'pair', left: `${c.bank} #${c.number}`, right: money(c.amount) });
      rows.push({ kind: 'text', text: `  Due ${c.dueDate}`, muted: true });
    }
    if (doc.settlement?.length) {
      rows.push({ kind: 'text', text: 'Settled', muted: true });
      for (const s of doc.settlement) rows.push({ kind: 'pair', left: `  ${s.invoiceId}`, right: money(s.amount) });
    }
  }

  if (doc.type === 'RETURN') {
    rows.push({ kind: 'rule' });
    if (doc.reasonText || doc.reasonCode) rows.push({ kind: 'pair', left: 'Reason', right: doc.reasonText || doc.reasonCode || '' });
    if (doc.disposition) rows.push({ kind: 'pair', left: 'Goes to', right: DISPOSITION_LABEL[doc.disposition] });
    if (doc.originalInvoice) rows.push({ kind: 'pair', left: 'Original invoice', right: doc.originalInvoice });
  }

  if (doc.type === 'DELIVERY') {
    rows.push({ kind: 'rule' });
    if (doc.salesId) rows.push({ kind: 'pair', left: 'Sales order', right: doc.salesId });
    if (doc.rejectReason) rows.push({ kind: 'pair', left: 'Short reason', right: doc.rejectReason });
    rows.push({ kind: 'pair', left: 'Proof of delivery', right: doc.signatureId ? 'Signed' : 'Not signed' });
  }

  rows.push({ kind: 'rule' });
  if (doc.type !== 'RECEIPT') {
    rows.push({ kind: 'pair', left: 'Gross', right: money(doc.gross) });
    if (doc.discounts > 0) rows.push({ kind: 'pair', left: 'Discounts', right: `-${money(doc.discounts)}` });
    rows.push({ kind: 'pair', left: 'Net', right: money(doc.net) });
    rows.push({ kind: 'pair', left: 'VAT', right: money(doc.vat) });
  }
  rows.push({ kind: 'pair', left: doc.type === 'RECEIPT' ? 'Amount received' : 'Total', right: money(doc.total) + cur, bold: true });
  if (doc.pointsEarned) rows.push({ kind: 'pair', left: 'Points earned', right: qty(doc.pointsEarned) });
  if (doc.pointsRedeemed) rows.push({ kind: 'pair', left: 'Points redeemed', right: qty(doc.pointsRedeemed) });

  if (doc.taxDocKind) {
    rows.push({ kind: 'rule' });
    rows.push({ kind: 'pair', left: TAX_DOC_LABEL[doc.taxDocKind], right: EDOC_STATUS_LABEL[doc.eDocStatus] });
    if (doc.etaUuid) rows.push({ kind: 'text', text: doc.etaUuid, muted: true });
  }

  if (doc.type === 'ORDER') {
    rows.push({ kind: 'gap' });
    rows.push({ kind: 'center', text: 'Order confirmation — not a tax document' });
  }
  rows.push({ kind: 'gap' });
  rows.push({ kind: 'center', text: 'Thank you' });
  return rows;
}

/** Fixed-width text for a thermal printer. */
export function renderReceiptText(rows: ReceiptRow[], cols: 32 | 48): string {
  const out: string[] = [];
  const wrap = (text: string, indent = ''): string[] => {
    const lines: string[] = [];
    let rest = text;
    while (rest.length > cols) {
      let cut = rest.lastIndexOf(' ', cols);
      if (cut <= indent.length) cut = cols;
      lines.push(rest.slice(0, cut).trimEnd());
      rest = indent + rest.slice(cut).trimStart();
    }
    lines.push(rest);
    return lines;
  };

  for (const r of rows) {
    switch (r.kind) {
      case 'rule':
        out.push('-'.repeat(cols));
        break;
      case 'gap':
        out.push('');
        break;
      case 'center':
        for (const line of wrap(r.text)) {
          const pad = Math.max(0, Math.floor((cols - line.length) / 2));
          out.push(' '.repeat(pad) + line);
        }
        break;
      case 'text':
        out.push(...wrap(r.text, r.text.startsWith('  ') ? '  ' : ''));
        break;
      case 'pair': {
        const right = r.right.length >= cols ? r.right.slice(0, cols) : r.right;
        const room = cols - right.length - 1;
        if (room < 4) {
          out.push(...wrap(r.left), right.padStart(cols));
        } else {
          const left = r.left.length > room ? r.left.slice(0, room) : r.left;
          out.push(left + ' '.repeat(cols - left.length - right.length) + right);
        }
        break;
      }
    }
  }
  return out.join('\n') + '\n';
}

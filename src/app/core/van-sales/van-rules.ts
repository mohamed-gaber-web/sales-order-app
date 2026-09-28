import { round2 } from './pricing-engine';
import {
  Cheque,
  Customer,
  OpenInvoice,
  ReturnReason,
  SettlementLine,
  TaxDocKind,
} from './van-sales.models';

/**
 * The pure business rules of the van cycle (spec §8.2–8.4): credit control,
 * oldest-first settlement, cheque validation, return pricing and the tax
 * document a sale produces. Like the pricing engine these take values and
 * return values, so each rule is unit-tested without a screen.
 */

// ── Credit (§8.2) ──────────────────────────────────────────────────────────

export type CreditBlock = 'CASH_CUSTOMER' | 'HOLD' | 'OVERDUE' | 'OVER_LIMIT';

export interface CreditCheck {
  ok: boolean;
  block?: CreditBlock;
  message?: string;
  balance: number;
  available: number;
}

export function customerBalance(customer: Customer): number {
  return round2(customer.openInvoices.reduce((s, i) => s + i.amount, 0));
}

/**
 * Whether `amount` may go on the customer's account. An approved override for
 * this customer and visit lifts every block except "cash customer", which is a
 * payment term, not a risk decision.
 */
export function checkCredit(customer: Customer, amount: number, overrideApproved = false): CreditCheck {
  const balance = customerBalance(customer);
  const available = round2(Math.max(0, customer.creditLimit - balance));
  const fail = (block: CreditBlock, message: string): CreditCheck => ({
    ok: false,
    block,
    message,
    balance,
    available,
  });

  if (customer.paymentTerms === 'CASH') return fail('CASH_CUSTOMER', 'Cash customer — credit is not offered.');
  if (overrideApproved) return { ok: true, balance, available };
  if (customer.creditHold) return fail('HOLD', `Credit hold${customer.holdReason ? ' — ' + customer.holdReason : ''}.`);
  if (customer.overdue) return fail('OVERDUE', 'Overdue invoices — credit is blocked.');
  if (balance + amount > customer.creditLimit) {
    return fail('OVER_LIMIT', `Over credit limit by ${round2(balance + amount - customer.creditLimit)}.`);
  }
  return { ok: true, balance, available };
}

// ── Settlement (§8.3) ──────────────────────────────────────────────────────

/**
 * Allocates `amount` across open invoices oldest first. Credit notes (negative
 * amounts) are left out — they are settled in the back office, not by the rep.
 */
export function settleOldestFirst(invoices: OpenInvoice[], amount: number): SettlementLine[] {
  let remaining = round2(Math.max(0, amount));
  return invoices
    .filter((i) => i.amount > 0)
    .slice()
    .sort((a, b) => (a.dueDate ?? a.date).localeCompare(b.dueDate ?? b.date) || a.date.localeCompare(b.date))
    .map((inv) => {
      const applied = round2(Math.min(inv.amount, remaining));
      remaining = round2(remaining - applied);
      return {
        invoiceId: inv.invoiceId,
        date: inv.date,
        open: inv.amount,
        applied,
        partial: applied > 0 && applied < inv.amount,
      };
    });
}

/** Applies a settlement to the customer's invoices, returning the new list. */
export function applySettlement(invoices: OpenInvoice[], settlement: { invoiceId: string; amount: number }[]): OpenInvoice[] {
  return invoices
    .map((inv) => {
      const hit = settlement.find((s) => s.invoiceId === inv.invoiceId);
      return hit ? { ...inv, amount: round2(inv.amount - hit.amount) } : inv;
    })
    .filter((inv) => inv.amount !== 0);
}

// ── Cheques (§7.4) ─────────────────────────────────────────────────────────

export interface ChequeValidation {
  ok: boolean;
  errors: string[];
  /** Index → message, for inline errors on the cheque cards. */
  byIndex: Record<number, string>;
  total: number;
}

export function validateCheques(cheques: Cheque[], openBalance: number): ChequeValidation {
  const errors: string[] = [];
  const byIndex: Record<number, string> = {};
  const seen = new Map<string, number>();

  cheques.forEach((c, i) => {
    if (!c.bank || !c.number.trim() || !c.dueDate) {
      byIndex[i] = 'Bank, number and due date are required.';
    } else if (!(c.amount > 0)) {
      byIndex[i] = 'Amount must be more than zero.';
    }
    const key = `${c.bank.trim().toLowerCase()}|${c.number.trim()}`;
    if (c.bank && c.number.trim()) {
      if (seen.has(key)) {
        byIndex[i] = `Duplicate of cheque ${seen.get(key)! + 1} (same bank and number).`;
        if (!errors.includes('Duplicate cheque')) errors.push('Duplicate cheque');
      } else {
        seen.set(key, i);
      }
    }
  });

  if (Object.keys(byIndex).length && !errors.length) errors.push('Complete every cheque');
  const total = round2(cheques.reduce((s, c) => s + (c.amount > 0 ? c.amount : 0), 0));
  if (!cheques.length) errors.push('Add at least one cheque');
  if (total > round2(openBalance)) errors.push('Total is more than the open balance');
  return { ok: errors.length === 0, errors, byIndex, total };
}

// ── Returns (§8.4) ─────────────────────────────────────────────────────────

/** The price a free return is credited at: last purchase price, else the list price. */
export function freeReturnPrice(
  lastPrices: { customerId: string; itemId: string; price: number }[],
  customerId: string,
  itemId: string,
  fallback: number
): number {
  return lastPrices.find((p) => p.customerId === customerId && p.itemId === itemId)?.price ?? fallback;
}

export function returnValueInclVat(lines: { qty: number; price: number; vatPct: number }[]): number {
  return round2(lines.reduce((s, l) => s + round2(l.qty * l.price * (1 + l.vatPct / 100)), 0));
}

export function isOverFreeReturnLimit(valueInclVat: number, limit: number): boolean {
  return valueInclVat > limit;
}

/** Where returned stock goes: back on the van, or into the damaged bucket for unload. */
export function returnDestination(reason: ReturnReason): 'VAN' | 'DAMAGED' {
  return reason.sellable ? 'VAN' : 'DAMAGED';
}

// ── Tax documents (§11 scenario 12) ────────────────────────────────────────

export function taxDocKindFor(customer: Customer, isReturn: boolean): TaxDocKind {
  const b2b = !!customer.taxId;
  if (isReturn) return b2b ? 'E_CREDIT_NOTE' : 'E_RECEIPT_RETURN';
  return b2b ? 'E_INVOICE' : 'E_RECEIPT';
}

export const TAX_DOC_LABEL: Record<TaxDocKind, string> = {
  E_INVOICE: 'E-Invoice',
  E_RECEIPT: 'E-Receipt',
  E_CREDIT_NOTE: 'E-Credit note',
  E_RECEIPT_RETURN: 'E-Return receipt',
};

// ── Geofence (F13) ─────────────────────────────────────────────────────────

/** Great-circle distance in metres. */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

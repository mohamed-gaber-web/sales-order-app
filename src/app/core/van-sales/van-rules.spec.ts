import {
  checkCredit,
  distanceMetres,
  freeReturnPrice,
  isOverFreeReturnLimit,
  returnDestination,
  returnValueInclVat,
  settleOldestFirst,
  taxDocKindFor,
  validateCheques,
} from './van-rules';
import { Customer } from './van-sales.models';

function customer(p: Partial<Customer> = {}): Customer {
  return {
    id: 'CU-1',
    name: 'Test',
    address: '',
    priceGroup: 'Retail',
    paymentTerms: 'CREDIT',
    creditLimit: 10000,
    overdue: false,
    creditHold: false,
    openInvoices: [],
    ...p,
  };
}

describe('credit control (§8.2)', () => {
  it('allows credit inside the limit', () => {
    expect(checkCredit(customer(), 5000).ok).toBeTrue();
  });

  it('blocks over the limit, and on hold, and when overdue', () => {
    const c = customer({ openInvoices: [{ invoiceId: 'A', date: '2026-09-01', amount: 8000 }] });
    expect(checkCredit(c, 2500).block).toBe('OVER_LIMIT');
    expect(checkCredit(customer({ creditHold: true }), 1).block).toBe('HOLD');
    expect(checkCredit(customer({ overdue: true }), 1).block).toBe('OVERDUE');
  });

  it('lets an approved override through — but never credit for a cash customer', () => {
    expect(checkCredit(customer({ overdue: true }), 1, true).ok).toBeTrue();
    expect(checkCredit(customer({ paymentTerms: 'CASH' }), 1, true).block).toBe('CASH_CUSTOMER');
  });
});

describe('settleOldestFirst (§8.3)', () => {
  const invoices = [
    { invoiceId: 'NEW', date: '2026-09-02', dueDate: '2026-10-02', amount: 6540 },
    { invoiceId: 'OLD', date: '2026-08-19', dueDate: '2026-09-18', amount: 5760 },
    { invoiceId: 'CN', date: '2026-08-01', amount: -300 },
  ];

  it('pays the oldest first and flags the partial one', () => {
    const s = settleOldestFirst(invoices, 8000);
    expect(s.map((x) => x.invoiceId)).toEqual(['OLD', 'NEW']);
    expect(s[0]).toEqual(jasmine.objectContaining({ applied: 5760, partial: false }));
    expect(s[1]).toEqual(jasmine.objectContaining({ applied: 2240, partial: true }));
  });

  it('leaves credit notes out', () => {
    expect(settleOldestFirst(invoices, 100000).some((x) => x.invoiceId === 'CN')).toBeFalse();
  });

  it('settles the whole balance exactly (scenario 5)', () => {
    const s = settleOldestFirst(invoices, 12300);
    expect(s.every((x) => !x.partial && x.applied === x.open)).toBeTrue();
  });
});

describe('validateCheques (§7.4)', () => {
  const ok = { bank: 'CIB', number: '1', dueDate: '2026-10-15', amount: 6000 };

  it('accepts two complete cheques within the balance', () => {
    const v = validateCheques([ok, { ...ok, bank: 'National Bank of Egypt', number: '2', amount: 6300 }], 12300);
    expect(v.ok).toBeTrue();
    expect(v.total).toBe(12300);
  });

  it('rejects a duplicate bank + number (scenario 6)', () => {
    const v = validateCheques([ok, { ...ok, amount: 100 }], 12300);
    expect(v.ok).toBeFalse();
    expect(v.errors).toContain('Duplicate cheque');
    expect(v.byIndex[1]).toContain('Duplicate');
  });

  it('rejects incomplete cheques, zero amounts, and totals above the balance', () => {
    expect(validateCheques([{ ...ok, number: '' }], 12300).ok).toBeFalse();
    expect(validateCheques([{ ...ok, amount: 0 }], 12300).ok).toBeFalse();
    expect(validateCheques([{ ...ok, amount: 20000 }], 12300).errors).toContain('Total is more than the open balance');
    expect(validateCheques([], 12300).ok).toBeFalse();
  });
});

describe('returns (§8.4)', () => {
  it('prices a free return at the last purchase price, else the list price', () => {
    const last = [{ customerId: 'CU-1', itemId: '1006', price: 33 }];
    expect(freeReturnPrice(last, 'CU-1', '1006', 35)).toBe(33);
    expect(freeReturnPrice(last, 'CU-1', '1008', 58)).toBe(58);
  });

  it('checks the limit including VAT (scenario 8)', () => {
    const value = returnValueInclVat([{ qty: 30, price: 35, vatPct: 14 }]);
    expect(value).toBe(1197);
    expect(isOverFreeReturnLimit(returnValueInclVat([{ qty: 5, price: 35, vatPct: 14 }]), 1000)).toBeFalse();
    expect(isOverFreeReturnLimit(1200, 1000)).toBeTrue();
  });

  it('sends sellable stock back to the van and the rest to the damaged bucket', () => {
    expect(returnDestination({ code: 'A', description: '', disposition: 'RESTOCK', sellable: true })).toBe('VAN');
    expect(returnDestination({ code: 'B', description: '', disposition: 'QUARANTINE', sellable: false })).toBe('DAMAGED');
  });
});

describe('tax document kind (scenario 12)', () => {
  it('issues an E-Invoice with a tax id and an E-Receipt without', () => {
    expect(taxDocKindFor(customer({ taxId: '123' }), false)).toBe('E_INVOICE');
    expect(taxDocKindFor(customer(), false)).toBe('E_RECEIPT');
    expect(taxDocKindFor(customer({ taxId: '123' }), true)).toBe('E_CREDIT_NOTE');
    expect(taxDocKindFor(customer(), true)).toBe('E_RECEIPT_RETURN');
  });
});

describe('distanceMetres', () => {
  it('measures roughly a kilometre per 0.009° of latitude', () => {
    const d = distanceMetres({ lat: 30, lng: 31 }, { lat: 30.009, lng: 31 });
    expect(d).toBeGreaterThan(990);
    expect(d).toBeLessThan(1010);
  });
});

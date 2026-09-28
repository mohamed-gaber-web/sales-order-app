import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable, throwError } from 'rxjs';
import { NetworkStatusService } from './network-status.service';
import { VanOutboxService } from './van-outbox.service';
import { VanBusinessError } from './van-sales-api';
import { VanSalesApiRouter } from './van-sales-api.router';
import { VanSalesHttpApi } from './van-sales-http.api';
import { VanSalesMockApi } from './van-sales-mock.api';
import { ServiceEnvelope } from './van-sales.models';

describe('VanOutboxService (spec §9)', () => {
  let outbox: VanOutboxService;
  let network: NetworkStatusService;
  let mock: VanSalesMockApi;

  beforeEach(() => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('gp.vanSales.'))
      .forEach((k) => localStorage.removeItem(k));
    TestBed.configureTestingModule({
      providers: [{ provide: VanSalesHttpApi, useValue: {} }],
    });
    network = TestBed.inject(NetworkStatusService);
    network.setSimulatedOffline(true);
    mock = TestBed.inject(VanSalesMockApi);
    mock.resetServer();
    outbox = TestBed.inject(VanOutboxService);
  });

  const invoiceBody = (id: string) => ({
    InvoiceId: id,
    CustAccount: 'CU-004515',
    PaymentMode: 'CASH',
    Lines: [{ ItemId: '1003', Qty: 20, FreeQty: 2 }],
    Total: 330.6,
  });

  it('queues while offline and posts once back online', async () => {
    const item = outbox.enqueue({ apiNo: 25, label: 'Invoices', body: invoiceBody('VI-1') });
    expect(outbox.find(item.mobileTransId)?.status).toBe('QUEUED');

    network.setSimulatedOffline(false);
    await outbox.sync();

    const done = outbox.find(item.mobileTransId)!;
    expect(done.status).toBe('POSTED');
    expect(done.d365DocumentId).toBe('VI-1');
    expect(outbox.pendingCount()).toBe(0);
  });

  it('writes MobileTransId into the body once, and it never changes', () => {
    const item = outbox.enqueue({ apiNo: 36, label: 'Visit log', body: { Event: 'CheckIn' } });
    expect((item.body as Record<string, unknown>)['MobileTransId']).toBe(item.mobileTransId);
  });

  it('scenario 10 — three offline documents reach D365 exactly once, even on a repeat send', async () => {
    outbox.enqueue({ apiNo: 25, label: 'Invoices', body: invoiceBody('VI-2') });
    const coll = outbox.enqueue({
      apiNo: 29,
      label: 'Collections',
      body: { ReceiptId: 'RC-1', CustAccount: 'CU-004512', Amount: 5760, Settlement: [{ InvoiceId: 'INV-87651', Amount: 5760 }] },
    });
    outbox.enqueue({
      apiNo: 27,
      label: 'Returns',
      body: { ReturnId: 'RT-1', CustAccount: 'CU-004515', Disposition: 'RESTOCK', Lines: [{ ItemId: '1003', Qty: 1 }], ValueInclVAT: 16.53 },
    });
    expect(outbox.pendingCount()).toBe(3);

    network.setSimulatedOffline(false);
    await outbox.sync();
    expect(outbox.pendingCount()).toBe(0);
    expect(mock.log.filter((l) => l.apiNo !== 46).length).toBe(3);

    // A retry after a lost response sends the same MobileTransId again.
    const env = await firstValueFrom(mock.post(29, coll.body as Record<string, unknown>));
    expect(env.Duplicate).toBeTrue();
    expect(env.DocumentId).toBe('RC-1');
    expect(mock.log.filter((l) => l.apiNo !== 46).length).toBe(3);
  });

  it('holds a dependent item until its parent has posted', async () => {
    const parent = outbox.enqueue({
      apiNo: 29,
      label: 'Collections',
      body: { ReceiptId: 'RC-2', CustAccount: 'CU-004512', Amount: 100, Settlement: [] },
    });
    const child = outbox.enqueue({
      apiNo: 30,
      label: 'Cheques',
      dependsOn: [parent.mobileTransId],
      body: { ReceiptId: 'RC-2', CustAccount: 'CU-004512', Cheques: [{ ChequeNum: '1', Bank: 'CIB', MaturityDate: '2026-10-01', Amount: 100 }] },
    });

    network.setSimulatedOffline(false);
    await outbox.sync();

    const order = mock.log.map((l) => l.mobileTransId);
    expect(order.indexOf(parent.mobileTransId)).toBeLessThan(order.indexOf(child.mobileTransId));
  });

  it('fails a business rejection at once, and lets a manual retry reuse the same id', async () => {
    const bad = outbox.enqueue({ apiNo: 25, label: 'Invoices', body: { ...invoiceBody('VI-3'), CustAccount: 'CU-NOPE' } });
    network.setSimulatedOffline(false);
    await outbox.sync();

    const failed = outbox.find(bad.mobileTransId)!;
    expect(failed.status).toBe('FAILED');
    expect(failed.lastError).toContain('not found');
    expect(failed.attempts).toBe(1);

    outbox.retry(bad.mobileTransId);
    expect(outbox.find(bad.mobileTransId)?.mobileTransId).toBe(bad.mobileTransId);
  });

  it('backs off on a network error instead of failing', async () => {
    const router = TestBed.inject(VanSalesApiRouter);
    spyOn(router, 'post').and.returnValue(throwError(() => new Error('socket hang up')) as Observable<ServiceEnvelope>);
    const item = outbox.enqueue({ apiNo: 36, label: 'Visit log', body: { Event: 'CheckIn' } });

    network.setSimulatedOffline(false);
    await outbox.sync();

    const after = outbox.find(item.mobileTransId)!;
    expect(after.status).toBe('QUEUED');
    expect(after.attempts).toBe(1);
    expect(Date.parse(after.nextAttemptAt!)).toBeGreaterThan(Date.now());
  });

  it('treats VanBusinessError as permanent', async () => {
    const router = TestBed.inject(VanSalesApiRouter);
    spyOn(router, 'post').and.returnValue(throwError(() => new VanBusinessError('Nope')) as Observable<ServiceEnvelope>);
    const item = outbox.enqueue({ apiNo: 36, label: 'Visit log', body: {} });
    network.setSimulatedOffline(false);
    await outbox.sync();
    expect(outbox.find(item.mobileTransId)?.status).toBe('FAILED');
  });
});

describe('VanSalesMockApi rules (spec §6.4)', () => {
  let mock: VanSalesMockApi;

  beforeEach(() => {
    localStorage.removeItem('gp.vanSales.mockServer');
    mock = new VanSalesMockApi();
    mock.resetServer();
  });

  it('refuses credit for an overdue customer without an approved override (scenario 4)', async () => {
    await expectAsync(
      firstValueFrom(mock.post(25, { MobileTransId: 'm1', InvoiceId: 'VI-9', CustAccount: 'CU-004520', PaymentMode: 'CREDIT', Total: 100, Lines: [] }))
    ).toBeRejectedWithError(VanBusinessError);

    const cash = await firstValueFrom(
      mock.post(25, { MobileTransId: 'm2', InvoiceId: 'VI-10', CustAccount: 'CU-004520', PaymentMode: 'CASH', Total: 100, Lines: [] })
    );
    expect(cash.Success).toBeTrue();
  });

  it('accepts an over-limit discount only with an approved request (scenario 3)', async () => {
    const body = { MobileTransId: 'm3', InvoiceId: 'VI-11', CustAccount: 'CU-004515', PaymentMode: 'CASH', Total: 10, ManualDiscountPct: 5, Lines: [] };
    await expectAsync(firstValueFrom(mock.post(25, body))).toBeRejected();

    await firstValueFrom(
      mock.post(90, { MobileTransId: 'a1', id: 'APR-1', type: 'EXTRA_DISCOUNT', customerId: 'CU-004515', repId: 'R', detail: '', payload: {}, createdAt: '' })
    );
    await firstValueFrom(mock.decideApproval('APR-1', 'APPROVED'));
    const ok = await firstValueFrom(mock.post(25, { ...body, MobileTransId: 'm4', ApprovalId: 'APR-1' }));
    expect(ok.Success).toBeTrue();
  });

  it('puts the customer on hold when a deposited cheque bounces (scenario 7)', async () => {
    await firstValueFrom(
      mock.post(30, {
        MobileTransId: 'c1',
        ReceiptId: 'RC-9',
        CustAccount: 'CU-004512',
        Cheques: [{ ChequeNum: '100245', Bank: 'CIB', MaturityDate: '2026-10-15', Amount: 6000 }],
      })
    );
    await expectAsync(firstValueFrom(mock.updateChequeStatus('RC-9', '100245', 'CIB', 'BOUNCED'))).toBeRejected();
    await firstValueFrom(mock.updateChequeStatus('RC-9', '100245', 'CIB', 'HANDED_TO_TREASURY'));
    await firstValueFrom(mock.updateChequeStatus('RC-9', '100245', 'CIB', 'DEPOSITED'));
    await firstValueFrom(mock.updateChequeStatus('RC-9', '100245', 'CIB', 'BOUNCED'));

    const customers = await firstValueFrom(mock.getCustomers());
    const c = customers.find((x) => x.id === 'CU-004512')!;
    expect(c.creditHold).toBeTrue();
    expect(c.openInvoices.some((i) => i.invoiceId === 'BNC-100245' && i.amount === 6000)).toBeTrue();
  });

  it('holds a free return over the limit for approval (scenario 8)', async () => {
    const body = {
      MobileTransId: 'r1',
      ReturnId: 'RT-9',
      CustAccount: 'CU-004877',
      Disposition: 'QUARANTINE',
      Lines: [{ ItemId: '1006', Qty: 30 }],
      ValueInclVAT: 1200,
    };
    await expectAsync(firstValueFrom(mock.post(28, body))).toBeRejected();
    const smaller = await firstValueFrom(mock.post(28, { ...body, MobileTransId: 'r2', ValueInclVAT: 199.5 }));
    expect(smaller.Success).toBeTrue();
  });
});

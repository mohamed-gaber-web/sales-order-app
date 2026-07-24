import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { QualityOrder, QualityDecision, TestVerdict } from '../../models/quality.model';

/** In-memory stub data — no D365 Quality Management service exists to wire this to yet. */
const ORDERS: QualityOrder[] = [
  {
    qualityOrderId: 'QO-000412',
    source: 'Purchase',
    sourceReference: 'PO-000481',
    itemNumber: 'ITM-3391',
    itemName: 'Galvanized Steel Bolt 8x40',
    vendorOrCustomer: 'Ahram Industrial Supplies',
    sampleSize: 8,
    lotSize: 126,
    quantity: 126,
    unitSymbol: 'EA',
    warehouseId: 'RECV',
    licensePlateId: 'LP-00043128',
    valuePerUnit: 383.3,
    createdAt: '2026-07-23T08:30:00',
    status: 'InProgress',
    tests: [
      { testId: 'T1', name: 'Outer Diameter', specLabel: '8.0 ± 0.2 mm', kind: 'range', min: 7.8, max: 8.2, measuredValue: 8.05, verdict: 'Pass' },
      { testId: 'T2', name: 'Tensile Strength', specLabel: '≥ 400 N/mm²', kind: 'min', min: 400, measuredValue: 438, verdict: 'Pass' },
      { testId: 'T3', name: 'Galvanizing Thickness', specLabel: '≥ 40 µm', kind: 'min', min: 40, measuredValue: 36, verdict: 'Fail' },
      { testId: 'T4', name: 'Visual Appearance', specLabel: 'No defects', kind: 'passfail', measuredValue: true, verdict: 'Pass' },
      { testId: 'T5', name: 'Salt Spray Test', specLabel: '≥ 96 h', kind: 'min', min: 96, verdict: 'Pending' },
    ],
  },
  {
    qualityOrderId: 'QO-000413',
    source: 'Production',
    sourceReference: 'PROD-000230',
    itemNumber: 'FG-2201',
    itemName: 'Mango Juice 1L',
    sampleSize: 5,
    lotSize: 4860,
    quantity: 4860,
    unitSymbol: 'EA',
    warehouseId: 'QI-01',
    licensePlateId: 'LP-00043877',
    valuePerUnit: 12.4,
    createdAt: '2026-07-23T16:22:00',
    status: 'Pending',
    tests: [
      { testId: 'T1', name: 'Brix Level', specLabel: '11.0 - 13.0 °Bx', kind: 'range', min: 11, max: 13, verdict: 'Pending' },
      { testId: 'T2', name: 'pH', specLabel: '3.3 - 3.8', kind: 'range', min: 3.3, max: 3.8, verdict: 'Pending' },
      { testId: 'T3', name: 'Seal Integrity', specLabel: 'No leaks', kind: 'passfail', verdict: 'Pending' },
    ],
  },
  {
    qualityOrderId: 'QO-000414',
    source: 'Return',
    sourceReference: 'RMA-000078',
    itemNumber: 'FG-2201',
    itemName: 'Mango Juice 1L — crushed cartons',
    vendorOrCustomer: 'Carfour Egypt — October',
    sampleSize: 40,
    lotSize: 40,
    quantity: 40,
    unitSymbol: 'EA',
    warehouseId: 'QI-01',
    valuePerUnit: 22.5,
    createdAt: '2026-07-22T11:15:00',
    status: 'Decided',
    decision: 'Reject',
    decisionNote: 'Damaged in transit — scrap 28, restock 12.',
    released: false,
    tests: [
      { testId: 'T1', name: 'Physical Condition', specLabel: '≥ 80% sound', kind: 'min', min: 80, measuredValue: 30, verdict: 'Fail' },
    ],
  },
  {
    qualityOrderId: 'QO-000410',
    source: 'Purchase',
    sourceReference: 'PO-000477',
    itemNumber: 'ITM-1120',
    itemName: 'Industrial Adhesive Tape 48mm',
    vendorOrCustomer: 'Nile Packaging Co.',
    sampleSize: 6,
    lotSize: 60,
    quantity: 60,
    unitSymbol: 'ROLL',
    warehouseId: 'QI-01',
    licensePlateId: 'LP-00043901',
    valuePerUnit: 45,
    createdAt: '2026-07-20T09:00:00',
    status: 'Decided',
    decision: 'Reject',
    released: false,
    tests: [
      { testId: 'T1', name: 'Adhesion Strength', specLabel: '≥ 6 N/25mm', kind: 'min', min: 6, measuredValue: 4.1, verdict: 'Fail' },
    ],
  },
];

function computeVerdict(kind: string, min: number | undefined, max: number | undefined, value: number | boolean | undefined): TestVerdict {
  if (value === undefined || value === null) return 'Pending';
  if (kind === 'passfail') return value === true ? 'Pass' : 'Fail';
  const v = Number(value);
  if (kind === 'min') return v >= (min ?? -Infinity) ? 'Pass' : 'Fail';
  if (kind === 'range') return v >= (min ?? -Infinity) && v <= (max ?? Infinity) ? 'Pass' : 'Fail';
  return 'Pending';
}

@Injectable({ providedIn: 'root' })
export class QualityService {
  getQueue(): Observable<QualityOrder[]> {
    return of(ORDERS.filter(o => o.status !== 'Decided')).pipe(delay(350));
  }

  getOrder(qualityOrderId: string): Observable<QualityOrder> {
    const order = ORDERS.find(o => o.qualityOrderId === qualityOrderId);
    if (!order) return throwError(() => new Error('Quality order not found'));
    return of(order).pipe(delay(250));
  }

  getQuarantined(): Observable<QualityOrder[]> {
    return of(ORDERS.filter(o => !!o.licensePlateId && !o.released)).pipe(delay(350));
  }

  submitTestResult(qualityOrderId: string, testId: string, value: number | boolean): Observable<QualityOrder> {
    const order = ORDERS.find(o => o.qualityOrderId === qualityOrderId);
    const test = order?.tests.find(t => t.testId === testId);
    if (!order || !test) return throwError(() => new Error('Test not found'));
    test.measuredValue = value;
    test.verdict = computeVerdict(test.kind, test.min, test.max, value);
    order.status = order.tests.every(t => t.verdict !== 'Pending') ? 'Pending' : 'InProgress';
    return of(order).pipe(delay(250));
  }

  submitDecision(qualityOrderId: string, decision: QualityDecision, note: string | undefined): Observable<QualityOrder> {
    const order = ORDERS.find(o => o.qualityOrderId === qualityOrderId);
    if (!order) return throwError(() => new Error('Quality order not found'));
    order.decision = decision;
    order.decisionNote = note;
    order.status = 'Decided';
    order.released = decision === 'Accept' || decision === 'ConditionalAccept';
    return of(order).pipe(delay(400));
  }

  releaseFromQuarantine(qualityOrderId: string): Observable<QualityOrder> {
    const order = ORDERS.find(o => o.qualityOrderId === qualityOrderId);
    if (!order) return throwError(() => new Error('Quality order not found'));
    order.released = true;
    return of(order).pipe(delay(400));
  }
}

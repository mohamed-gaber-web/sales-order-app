export type QualitySource = 'Purchase' | 'Production' | 'Return';
export type QualityOrderStatus = 'Pending' | 'InProgress' | 'Decided';
export type TestVerdict = 'Pass' | 'Fail' | 'Pending';
export type TestKind = 'range' | 'min' | 'passfail';
export type QualityDecision = 'Accept' | 'ConditionalAccept' | 'Reject';

export interface QualityTest {
  testId: string;
  name: string;
  specLabel: string;
  kind: TestKind;
  min?: number;
  max?: number;
  measuredValue?: number | boolean;
  verdict: TestVerdict;
}

export interface QualityOrder {
  qualityOrderId: string;
  source: QualitySource;
  sourceReference: string;
  itemNumber: string;
  itemName?: string;
  vendorOrCustomer?: string;
  sampleSize: number;
  lotSize: number;
  quantity: number;
  unitSymbol?: string;
  warehouseId?: string;
  licensePlateId?: string;
  valuePerUnit?: number;
  createdAt: string;
  status: QualityOrderStatus;
  decision?: QualityDecision;
  decisionNote?: string;
  released?: boolean;
  tests: QualityTest[];
}

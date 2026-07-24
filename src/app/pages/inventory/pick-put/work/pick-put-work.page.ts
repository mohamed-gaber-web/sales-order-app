import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';

export type PickPutState =
  | 'Idle'
  | 'WorkAssigned'
  | 'AtPickLocation'
  | 'ItemScanned'
  | 'QtyConfirmed'
  | 'AtPutLocation'
  | 'Completed';

export interface WorkLine {
  lineNumber: number;
  itemNumber: string;
  itemName?: string;
  fromLocation: string;
  toLocation: string;
  requestedQty: number;
  pickedQty?: number;
  unitSymbol?: string;
}

const STATE_ORDER: PickPutState[] = [
  'Idle',
  'WorkAssigned',
  'AtPickLocation',
  'ItemScanned',
  'QtyConfirmed',
  'AtPutLocation',
  'Completed',
];

@Component({
  selector: 'app-pick-put-work',
  templateUrl: './pick-put-work.page.html',
  styleUrls: ['./pick-put-work.page.scss'],
  standalone: false,
})
export class PickPutWorkPage implements OnInit {
  workId = '';
  workItem: any = null;
  state: PickPutState = 'Idle';
  confirmedQty: number | null = null;

  stubLine: WorkLine = {
    lineNumber: 1,
    itemNumber: 'ITEM-001',
    itemName: 'Widget Assembly A',
    fromLocation: 'LOC-A-12',
    toLocation: 'LOC-OUT-01',
    requestedQty: 10,
    pickedQty: 0,
    unitSymbol: 'EA',
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private toastCtrl: ToastController,
  ) {}

  ngOnInit(): void {
    this.workId = this.route.snapshot.paramMap.get('workId') ?? '';
    const nav = this.router.getCurrentNavigation();
    this.workItem = nav?.extras?.state?.['workItem'] ?? null;
    if (this.workItem) {
      this.state = 'WorkAssigned';
    }
    this.confirmedQty = this.stubLine.requestedQty;
  }

  adjustConfirmedQty(delta: number): void {
    const current = this.confirmedQty ?? this.stubLine.requestedQty;
    this.confirmedQty = Math.max(0, current + delta);
  }

  get stateIndex(): number {
    return STATE_ORDER.indexOf(this.state);
  }

  get progressPercent(): number {
    return Math.round((this.stateIndex / (STATE_ORDER.length - 1)) * 100);
  }

  get stateLabel(): string {
    switch (this.state) {
      case 'Idle':          return 'Waiting';
      case 'WorkAssigned':  return 'Work Assigned';
      case 'AtPickLocation': return 'At Pick Location';
      case 'ItemScanned':   return 'Item Scanned';
      case 'QtyConfirmed':  return 'Qty Confirmed';
      case 'AtPutLocation': return 'At Put Location';
      case 'Completed':     return 'Completed';
    }
  }

  get nextLabel(): string {
    switch (this.state) {
      case 'Idle':          return 'Start Work';
      case 'WorkAssigned':  return 'Navigate to Pick Location';
      case 'AtPickLocation': return 'Confirm Item Scan';
      case 'ItemScanned':   return 'Confirm Quantity';
      case 'QtyConfirmed':  return 'Navigate to Put Location';
      case 'AtPutLocation': return 'Complete Put';
      default: return '';
    }
  }

  nextStep(): void {
    const idx = STATE_ORDER.indexOf(this.state);
    if (idx < STATE_ORDER.length - 1) {
      this.state = STATE_ORDER[idx + 1];
    }
  }

  async done(): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: 'Work order completed',
      buttons: [{ text: 'Dismiss', role: 'cancel' }],
      color: 'success',
      position: 'bottom',
      icon: 'checkmark-circle-outline',
    });
    await toast.present();
    this.router.navigate(['/inventory/pick-put']);
  }

  goBack(): void {
    this.router.navigate(['/inventory/pick-put']);
  }
}

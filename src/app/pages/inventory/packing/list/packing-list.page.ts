import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';

export interface PackingItem {
  itemNumber: string;
  quantity: number;
  unitSymbol?: string;
  weight?: number;
}

export interface PackingContainer {
  containerId: string;
  containerType: 'Carton' | 'Pallet';
  maxWeight?: number;
  currentWeight?: number;
  status: 'Open' | 'Closed';
  items: PackingItem[];
}

let containerSeq = 1;

@Component({
  selector: 'app-packing-list',
  templateUrl: './packing-list.page.html',
  styleUrls: ['./packing-list.page.scss'],
  standalone: false,
})
export class PackingListPage {
  // Setup form fields
  salesOrderNumber = '';
  containerType: 'Carton' | 'Pallet' = 'Carton';

  // Active container
  container: PackingContainer | null = null;

  // Item scan form
  scanItemNumber = '';
  scanQty: number | null = null;

  readonly STUB_WEIGHT_KG = 0.5;

  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
  ) {}

  goBack(): void {
    this.router.navigate(['/inventory']);
  }

  get canOpenContainer(): boolean {
    return !!this.salesOrderNumber.trim() && !!this.containerType;
  }

  openContainer(): void {
    const id = `${this.containerType.toUpperCase()}-${String(containerSeq++).padStart(4, '0')}`;
    this.container = {
      containerId: id,
      containerType: this.containerType,
      maxWeight: this.containerType === 'Carton' ? 20 : 1000,
      currentWeight: 0,
      status: 'Open',
      items: [],
    };
  }

  get totalWeight(): number {
    if (!this.container) return 0;
    return this.container.items.reduce(
      (sum, item) => sum + item.quantity * this.STUB_WEIGHT_KG,
      0,
    );
  }

  get canAddItem(): boolean {
    return !!this.scanItemNumber.trim() && !!this.scanQty && this.scanQty > 0;
  }

  addItem(): void {
    if (!this.container || !this.canAddItem) return;
    const existing = this.container.items.find(i => i.itemNumber === this.scanItemNumber.trim());
    if (existing) {
      existing.quantity += this.scanQty!;
    } else {
      this.container.items.push({
        itemNumber: this.scanItemNumber.trim(),
        quantity: this.scanQty!,
        unitSymbol: 'EA',
        weight: this.STUB_WEIGHT_KG,
      });
    }
    this.scanItemNumber = '';
    this.scanQty = null;
  }

  async closeContainer(): Promise<void> {
    if (!this.container) return;
    const alert = await this.alertCtrl.create({
      header: 'Close Container',
      message: `Close container ${this.container.containerId}? This will print the shipping label.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Close & Print',
          handler: async () => {
            const loading = await this.loadingCtrl.create({ message: 'Closing container...', duration: 1000 });
            await loading.present();
            await loading.onDidDismiss();
            if (this.container) {
              this.container.status = 'Closed';
            }
            const toast = await this.toastCtrl.create({
              message: 'Container closed, label printed',
              duration: 2500,
              color: 'success',
              position: 'bottom',
              icon: 'print-outline',
            });
            await toast.present();
          },
        },
      ],
    });
    await alert.present();
  }

  containerTypeOptions = [
    { label: 'Carton', value: 'Carton' },
    { label: 'Pallet', value: 'Pallet' },
  ];
}

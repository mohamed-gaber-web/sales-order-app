import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';

export interface LicensePlate {
  LicensePlateId: string;
  WarehouseId?: string;
  LocationId?: string;
  Status?: 'Available' | 'Blocked' | 'InTransit';
}

export interface LicensePlateContent {
  itemNumber: string;
  quantity: number;
  unitSymbol?: string;
}

@Component({
  selector: 'app-license-plate-detail',
  templateUrl: './license-plate-detail.page.html',
  styleUrls: ['./license-plate-detail.page.scss'],
  standalone: false,
})
export class LicensePlateDetailPage implements OnInit {
  lpId = '';

  lp: LicensePlate = {
    LicensePlateId: '',
    WarehouseId: 'WH-01',
    LocationId: 'LOC-A-12',
    Status: 'Available',
  };

  contents: LicensePlateContent[] = [
    { itemNumber: 'ITEM-001', quantity: 10, unitSymbol: 'EA' },
    { itemNumber: 'ITEM-042', quantity: 4, unitSymbol: 'BOX' },
    { itemNumber: 'ITEM-099', quantity: 25, unitSymbol: 'EA' },
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
  ) {}

  ngOnInit(): void {
    this.lpId = this.route.snapshot.paramMap.get('lpId') ?? '';
    this.lp.LicensePlateId = this.lpId;
  }

  goBack(): void {
    this.router.navigate(['/inventory/license-plate']);
  }

  getStatusColor(status?: string): string {
    switch (status) {
      case 'Available': return 'success';
      case 'Blocked':   return 'danger';
      case 'InTransit': return 'warning';
      default:          return 'medium';
    }
  }

  async printLabel(): Promise<void> {
    const loading = await this.loadingCtrl.create({ message: 'Sending to printer...', duration: 900 });
    await loading.present();
    await loading.onDidDismiss();
    const toast = await this.toastCtrl.create({
      message: 'Label sent to printer',
      duration: 2500,
      color: 'success',
      position: 'bottom',
      icon: 'print-outline',
    });
    await toast.present();
  }
}

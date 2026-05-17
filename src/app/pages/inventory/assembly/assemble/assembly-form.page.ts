import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';

interface BomLine {
  itemNumber: string;
  itemName: string;
  requiredQuantity: number;
  unitSymbol: string;
  issued: boolean;
}

@Component({
  selector: 'app-assembly-form',
  templateUrl: './assembly-form.page.html',
  styleUrls: ['./assembly-form.page.scss'],
  standalone: false,
})
export class AssemblyFormPage implements OnInit {
  orderNumber = '';
  parentItemNumber = 'FG-10042';
  parentItemName = 'Finished Goods Assembly Kit A';
  quantity = 10;
  warehouseId = '11';
  status: 'Open' | 'InProgress' | 'Completed' = 'Open';
  isSubmitting = false;

  // Stub BOM lines — replace with API call when available
  bomLines: BomLine[] = [
    { itemNumber: 'RM-00110', itemName: 'Steel Bracket 50mm', requiredQuantity: 10, unitSymbol: 'EA', issued: false },
    { itemNumber: 'RM-00214', itemName: 'Rubber Gasket Ring', requiredQuantity: 20, unitSymbol: 'EA', issued: false },
    { itemNumber: 'RM-00387', itemName: 'M6 Hex Bolt',       requiredQuantity: 40, unitSymbol: 'EA', issued: false },
  ];

  get allIssued(): boolean {
    return this.bomLines.every(l => l.issued);
  }

  get issuedCount(): number {
    return this.bomLines.filter(l => l.issued).length;
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
  ) {}

  ngOnInit() {
    this.orderNumber = this.route.snapshot.paramMap.get('orderNumber') ?? '';
  }

  getStatusColor(): string {
    switch (this.status) {
      case 'InProgress': return '#d97706';
      case 'Completed':  return '#16a34a';
      default:           return '#2563eb';
    }
  }

  getStatusBg(): string {
    switch (this.status) {
      case 'InProgress': return 'rgba(217,119,6,.12)';
      case 'Completed':  return 'rgba(22,163,74,.12)';
      default:           return 'rgba(37,99,235,.12)';
    }
  }

  async submit() {
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    const loading = await this.loadingCtrl.create({
      message: 'Posting assembly...',
      spinner: 'crescent',
    });
    await loading.present();

    // Stub: simulate 1.5s API call
    setTimeout(async () => {
      await loading.dismiss();
      this.isSubmitting = false;
      const t = await this.toastCtrl.create({
        message: `Assembly posted for order ${this.orderNumber}.`,
        duration: 3500,
        color: 'success',
        position: 'bottom',
      });
      await t.present();
      this.router.navigate(['/inventory/assembly']);
    }, 1500);
  }

  goBack() { this.router.navigate(['/inventory/assembly']); }
}

import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';

interface ComponentOutput {
  itemNumber: string;
  itemName: string;
  expectedQuantity: number;
  unitSymbol: string;
  confirmed: boolean;
}

@Component({
  selector: 'app-disassembly-form',
  templateUrl: './disassembly-form.page.html',
  styleUrls: ['./disassembly-form.page.scss'],
  standalone: false,
})
export class DisassemblyFormPage implements OnInit {
  orderNumber = '';
  parentItemNumber = 'FG-10042';
  parentItemName = 'Finished Goods Assembly Kit A';
  quantity = 10;
  warehouseId = '11';
  isSubmitting = false;

  // Stub component outputs — replace with API call when available
  componentOutputs: ComponentOutput[] = [
    { itemNumber: 'RM-00110', itemName: 'Steel Bracket 50mm', expectedQuantity: 10, unitSymbol: 'EA', confirmed: false },
    { itemNumber: 'RM-00214', itemName: 'Rubber Gasket Ring',  expectedQuantity: 20, unitSymbol: 'EA', confirmed: false },
    { itemNumber: 'RM-00387', itemName: 'M6 Hex Bolt',         expectedQuantity: 40, unitSymbol: 'EA', confirmed: false },
  ];

  get confirmedCount(): number {
    return this.componentOutputs.filter(c => c.confirmed).length;
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

  async submit() {
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    const loading = await this.loadingCtrl.create({
      message: 'Posting disassembly...',
      spinner: 'crescent',
    });
    await loading.present();

    // Stub: simulate 1.5s API call
    setTimeout(async () => {
      await loading.dismiss();
      this.isSubmitting = false;
      const t = await this.toastCtrl.create({
        message: `Disassembly posted for "${this.parentItemNumber}".`,
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

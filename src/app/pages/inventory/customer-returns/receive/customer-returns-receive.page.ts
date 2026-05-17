import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { DispositionType } from '../../../../models/inventory.model';

@Component({
  selector: 'app-customer-returns-receive',
  templateUrl: './customer-returns-receive.page.html',
  styleUrls: ['./customer-returns-receive.page.scss'],
  standalone: false,
})
export class CustomerReturnsReceivePage implements OnInit {
  returnNumber = '';
  form!: FormGroup;
  isSubmitting = false;

  readonly dispositions: { label: string; value: DispositionType; color: string }[] = [
    { label: 'Stock',       value: 'Stock',       color: 'success' },
    { label: 'Quarantine',  value: 'Quarantine',  color: 'warning' },
    { label: 'Scrap',       value: 'Scrap',       color: 'danger'  },
    { label: 'Inspection',  value: 'Inspection',  color: 'primary' },
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
  ) {}

  ngOnInit() {
    this.returnNumber = this.route.snapshot.paramMap.get('returnNumber') ?? '';
    this.form = this.fb.group({
      itemNumber:      ['', [Validators.required, Validators.minLength(1)]],
      receivedQty:     [1, [Validators.required, Validators.min(0.001)]],
      dispositionCode: ['Stock', Validators.required],
      conditionCode:   [''],
      notes:           [''],
    });
  }

  async submitReturn() {
    if (this.form.invalid || this.isSubmitting) return;
    const loading = await this.loadingCtrl.create({ message: 'Processing return...', spinner: 'crescent' });
    await loading.present();
    this.isSubmitting = true;

    // Stub: replace with actual return posting service call
    setTimeout(async () => {
      await loading.dismiss();
      this.isSubmitting = false;
      const t = await this.toastCtrl.create({
        message: `Return for order ${this.returnNumber} recorded.`,
        duration: 3000, color: 'success', position: 'bottom'
      });
      await t.present();
      this.router.navigate(['/inventory/customer-returns']);
    }, 1200);
  }

  goBack() { this.router.navigate(['/inventory/customer-returns']); }
}

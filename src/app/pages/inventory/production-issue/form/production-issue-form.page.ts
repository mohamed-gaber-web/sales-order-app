import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { ProductionIssueService } from '../../../../core/services/production-issue.service';

@Component({
  selector: 'app-production-issue-form',
  templateUrl: './production-issue-form.page.html',
  styleUrls: ['./production-issue-form.page.scss'],
  standalone: false,
})
export class ProductionIssueFormPage implements OnInit {
  orderNumber = '';
  itemName?: string;
  orderedQuantity?: number;
  status?: string;
  dataAreaId = 'usmf';

  form!: FormGroup;
  isSubmitting = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private productionIssueService: ProductionIssueService,
  ) {}

  ngOnInit() {
    this.orderNumber = this.route.snapshot.paramMap.get('orderNumber') ?? '';

    const nav = this.router.getCurrentNavigation();
    const state = nav?.extras?.state ?? history.state;

    const itemNumber = state?.['itemNumber'] ?? '';
    this.itemName = state?.['itemName'];
    this.orderedQuantity = state?.['orderedQuantity'];
    this.dataAreaId = state?.['dataAreaId'] ?? 'usmf';
    this.status = state?.['status'];
    const warehouseId = state?.['warehouseId'] ?? '';

    this.form = this.fb.group({
      itemNumber:  [itemNumber, [Validators.required, Validators.minLength(1)]],
      issueQty:    [null, [Validators.required, Validators.min(0.001)]],
      warehouseId: [warehouseId, Validators.required],
      batchId:     [''],
    });
  }

  async submitIssue() {
    if (this.form.invalid || this.isSubmitting) return;

    const { itemNumber, issueQty, warehouseId, batchId } = this.form.value as {
      itemNumber: string;
      issueQty: number;
      warehouseId: string;
      batchId: string;
    };

    const loading = await this.loadingCtrl.create({ message: 'Posting issue...', spinner: 'crescent' });
    await loading.present();
    this.isSubmitting = true;

    const payload = {
      productionOrderNumber: this.orderNumber,
      dataAreaId: this.dataAreaId,
      lines: [{
        itemNumber: itemNumber.trim(),
        issueQty,
        warehouseId: warehouseId.trim(),
        ...(batchId.trim() ? { batchId: batchId.trim() } : {}),
      }],
    };

    this.productionIssueService.postProductionIssue(payload).subscribe({
      next: async () => {
        await loading.dismiss();
        this.isSubmitting = false;
        const t = await this.toastCtrl.create({
          message: `Issue posted for order ${this.orderNumber}.`,
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'success',
          position: 'bottom',
        });
        await t.present();
        this.router.navigate(['/inventory/production-issue']);
      },
      error: async (err) => {
        await loading.dismiss();
        this.isSubmitting = false;
        const msg = err?.error?.Message ?? err?.error?.message ?? err?.message ?? 'Issue posting failed. Try again.';
        const t = await this.toastCtrl.create({ message: msg, buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom' });
        await t.present();
      }
    });
  }

  getStatusColor(status?: string): string {
    switch ((status ?? '').toLowerCase()) {
      case 'released': return '#16a34a';
      case 'started':  return '#d97706';
      case 'reported': return '#2563eb';
      default:         return '#6b7280';
    }
  }

  getStatusBg(status?: string): string {
    switch ((status ?? '').toLowerCase()) {
      case 'released': return 'rgba(22,163,74,.12)';
      case 'started':  return 'rgba(217,119,6,.12)';
      case 'reported': return 'rgba(37,99,235,.12)';
      default:         return 'rgba(107,114,128,.12)';
    }
  }

  goBack() { this.router.navigate(['/inventory/production-issue']); }
}

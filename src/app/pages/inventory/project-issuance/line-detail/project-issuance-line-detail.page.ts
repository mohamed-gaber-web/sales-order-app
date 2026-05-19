import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { ProjectIssuanceService } from '../../../../core/services/project-issuance.service';

@Component({
  selector: 'app-project-issuance-line-detail',
  templateUrl: './project-issuance-line-detail.page.html',
  styleUrls: ['./project-issuance-line-detail.page.scss'],
  standalone: false,
})
export class ProjectIssuanceLineDetailPage implements OnInit {
  projectId = '';
  lineNumber = 0;
  projectName = '';
  dataAreaId = 'usmf';

  itemNumber = '';
  productName = '';
  salesCategory = '';
  linePropertyId = '';
  requiredQuantity = 0;
  remainingQuantity = 0;
  lineStatus = '';
  requestedReceiptDate = '';

  form!: FormGroup;
  isSubmitting = false;
  postPackingSlip = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private service: ProjectIssuanceService,
  ) {}

  ngOnInit() {
    this.projectId = this.route.snapshot.paramMap.get('projectId') ?? '';
    this.lineNumber = Number(this.route.snapshot.paramMap.get('lineNumber') ?? 0);

    const nav = this.router.getCurrentNavigation();
    const state = nav?.extras?.state ?? history.state;
    this.projectName = state?.['projectName'] ?? '';
    this.dataAreaId = state?.['dataAreaId'] ?? 'usmf';
    this.itemNumber = state?.['itemNumber'] ?? '';
    this.productName = state?.['productName'] ?? '';
    this.salesCategory = state?.['salesCategory'] ?? '';
    this.linePropertyId = state?.['linePropertyId'] ?? '';
    this.requiredQuantity = state?.['requiredQuantity'] ?? 0;
    this.remainingQuantity = state?.['remainingQuantity'] ?? 0;
    this.lineStatus = state?.['lineStatus'] ?? '';
    this.requestedReceiptDate = state?.['requestedReceiptDate'] ?? '';

    this.form = this.fb.group({
      quantityToIssue: [this.remainingQuantity, [Validators.required, Validators.min(0.001), Validators.max(this.remainingQuantity)]],
      site:            ['', Validators.required],
      warehouse:       ['', Validators.required],
      location:        [''],
      batchNumber:     [''],
      serialNumber:    [''],
      unit:            ['EA', Validators.required],
    });
  }

  get canPost(): boolean {
    return this.form.valid && !this.isSubmitting;
  }

  async submitPickingList() {
    if (!this.canPost) {
      this.form.markAllAsTouched();
      return;
    }

    const { quantityToIssue, site, warehouse, location, batchNumber, serialNumber, unit } = this.form.value as {
      quantityToIssue: number;
      site: string;
      warehouse: string;
      location: string;
      batchNumber: string;
      serialNumber: string;
      unit: string;
    };

    const loading = await this.loadingCtrl.create({
      message: this.postPackingSlip ? 'Posting Picking List & Packing Slip...' : 'Posting Picking List...',
      spinner: 'crescent'
    });
    await loading.present();
    this.isSubmitting = true;

    const payload = {
      dataAreaId: this.dataAreaId,
      projectId: this.projectId,
      itemRequirementId: `${this.projectId}-${this.lineNumber}`,
      lineNumber: this.lineNumber,
      itemNumber: this.itemNumber,
      quantityToIssue,
      unit,
      site: site.trim(),
      warehouse: warehouse.trim(),
      ...(location.trim() ? { location: location.trim() } : {}),
      ...(batchNumber.trim() ? { batchNumber: batchNumber.trim() } : {}),
      ...(serialNumber.trim() ? { serialNumber: serialNumber.trim() } : {}),
      postPackingSlip: this.postPackingSlip,
    };

    this.service.postPickingList(payload).subscribe({
      next: async () => {
        await loading.dismiss();
        this.isSubmitting = false;
        const msg = this.postPackingSlip
          ? `Picking List and Packing Slip posted for ${this.itemNumber}.`
          : `Picking List posted for ${this.itemNumber}.`;
        const t = await this.toastCtrl.create({ message: msg, duration: 3000, color: 'success', position: 'bottom' });
        await t.present();
        this.router.navigate(['/inventory/project-issuance/detail', this.projectId], {
          state: { projectName: this.projectName, dataAreaId: this.dataAreaId }
        });
      },
      error: async (err) => {
        await loading.dismiss();
        this.isSubmitting = false;
        const msg = err?.error?.Message ?? err?.error?.message ?? err?.message ?? 'Posting failed. Try again.';
        const t = await this.toastCtrl.create({ message: msg, duration: 5000, color: 'danger', position: 'bottom' });
        await t.present();
      }
    });
  }

  getStatusColor(status?: string): string {
    switch ((status ?? '').toLowerCase()) {
      case 'open':    return '#16a34a';
      case 'partial': return '#d97706';
      case 'closed':  return '#6b7280';
      default:        return '#2563eb';
    }
  }

  getStatusBg(status?: string): string {
    switch ((status ?? '').toLowerCase()) {
      case 'open':    return 'rgba(22,163,74,.12)';
      case 'partial': return 'rgba(217,119,6,.12)';
      case 'closed':  return 'rgba(107,114,128,.12)';
      default:        return 'rgba(37,99,235,.12)';
    }
  }
}

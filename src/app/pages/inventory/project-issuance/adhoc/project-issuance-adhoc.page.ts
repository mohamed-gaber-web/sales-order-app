import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { ProjectIssuanceService } from '../../../../core/services/project-issuance.service';

const LINE_PROPERTIES = ['Billable', 'Non-Billable', 'Complimentary', 'Internal'];

@Component({
  selector: 'app-project-issuance-adhoc',
  templateUrl: './project-issuance-adhoc.page.html',
  styleUrls: ['./project-issuance-adhoc.page.scss'],
  standalone: false,
})
export class ProjectIssuanceAdhocPage implements OnInit {
  projectId = '';
  projectName = '';
  dataAreaId = 'usmf';

  form!: FormGroup;
  isSubmitting = false;
  lineProperties = LINE_PROPERTIES;

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
    const nav = this.router.getCurrentNavigation();
    const state = nav?.extras?.state ?? history.state;
    this.projectName = state?.['projectName'] ?? '';
    this.dataAreaId = state?.['dataAreaId'] ?? 'usmf';

    this.form = this.fb.group({
      itemNumber:     ['', Validators.required],
      quantity:       [null, [Validators.required, Validators.min(0.001)]],
      unit:           ['EA', Validators.required],
      site:           ['', Validators.required],
      warehouse:      ['', Validators.required],
      location:       [''],
      batchNumber:    [''],
      serialNumber:   [''],
      categoryId:     [''],
      activityNumber: [''],
      linePropertyId: ['Billable', Validators.required],
    });
  }

  get canPost(): boolean {
    return this.form.valid && !this.isSubmitting;
  }

  async submitIssuance() {
    if (!this.canPost) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.value as {
      itemNumber: string;
      quantity: number;
      unit: string;
      site: string;
      warehouse: string;
      location: string;
      batchNumber: string;
      serialNumber: string;
      categoryId: string;
      activityNumber: string;
      linePropertyId: string;
    };

    const loading = await this.loadingCtrl.create({ message: 'Posting item issuance...', spinner: 'crescent' });
    await loading.present();
    this.isSubmitting = true;

    const payload = {
      dataAreaId: this.dataAreaId,
      projectId: this.projectId,
      journalName: 'ProjItem',
      line: {
        itemNumber: v.itemNumber.trim(),
        quantity: v.quantity,
        unit: v.unit.trim(),
        site: v.site.trim(),
        warehouse: v.warehouse.trim(),
        ...(v.location.trim() ? { location: v.location.trim() } : {}),
        ...(v.batchNumber.trim() ? { batchNumber: v.batchNumber.trim() } : {}),
        ...(v.serialNumber.trim() ? { serialNumber: v.serialNumber.trim() } : {}),
        ...(v.categoryId.trim() ? { categoryId: v.categoryId.trim() } : {}),
        ...(v.activityNumber.trim() ? { activityNumber: v.activityNumber.trim() } : {}),
        linePropertyId: v.linePropertyId,
      }
    };

    this.service.postAdHocIssuance(payload).subscribe({
      next: async () => {
        await loading.dismiss();
        this.isSubmitting = false;
        const t = await this.toastCtrl.create({
          message: `Item ${v.itemNumber} issued to project ${this.projectId}.`,
          duration: 3000, color: 'success', position: 'bottom'
        });
        await t.present();
        this.router.navigate(['/inventory/project-issuance/detail', this.projectId], {
          state: { projectName: this.projectName, dataAreaId: this.dataAreaId }
        });
      },
      error: async (err) => {
        await loading.dismiss();
        this.isSubmitting = false;
        const msg = err?.error?.Message ?? err?.error?.message ?? err?.message ?? 'Issuance failed. Try again.';
        const t = await this.toastCtrl.create({ message: msg, duration: 5000, color: 'danger', position: 'bottom' });
        await t.present();
      }
    });
  }
}

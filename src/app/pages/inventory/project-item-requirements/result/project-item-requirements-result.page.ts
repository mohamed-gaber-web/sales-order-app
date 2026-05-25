import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { ProjectItemRequirementsService, PickingListRequest } from '../../../../core/services/project-item-requirements.service';

@Component({
  selector: 'app-pir-result',
  templateUrl: './project-item-requirements-result.page.html',
  styleUrls: ['./project-item-requirements-result.page.scss'],
  standalone: false,
})
export class ProjectItemRequirementsResultPage implements OnInit {
  success = false;
  lineCount = 0;
  salesOrderID = '';
  packingSlipId = '';
  errorMessage = '';
  errorPayload = '';
  projectId = '';
  projectName = '';
  copied = false;
  isRetrying = false;

  retryRequest: PickingListRequest | null = null;

  constructor(
    private router: Router,
    private toastCtrl: ToastController,
    private service: ProjectItemRequirementsService,
  ) {}

  ngOnInit() {
    const state = history.state;
    this.success       = state?.success ?? false;
    this.lineCount     = state?.lineCount ?? 0;
    this.salesOrderID  = state?.salesOrderID ?? '';
    this.packingSlipId = state?.packingSlipId ?? '';
    this.errorMessage  = state?.errorMessage ?? 'An unexpected error occurred.';
    this.errorPayload  = state?.errorPayload ?? '';
    this.retryRequest  = state?.retryRequest ?? null;
    this.projectId     = state?.projectId ?? '';
    this.projectName   = state?.projectName ?? '';
  }

  backToProject() {
    // Navigate back to Screen 2 — ionViewWillEnter will refresh from API (AC10)
    this.router.navigate(
      ['/inventory/project-item-requirements/requirements', this.projectId],
      { state: { projectName: this.projectName } }
    );
  }

  done() {
    this.router.navigate(['/inventory/project-item-requirements']);
  }

  // Re-posts the exact same request body (AC11)
  retry() {
    if (!this.retryRequest || this.isRetrying) return;
    this.isRetrying = true;

    this.service.postPickingList(this.retryRequest).subscribe({
      next: (res: any) => {
        this.isRetrying = false;
        if (res?.Success === false) {
          this.errorMessage = res.ErrorMessage ?? 'Posting failed.';
          this.errorPayload = JSON.stringify(res);
          return;
        }
        this.success = true;
        this.packingSlipId = res?.PackingSlipId ?? res?.packingSlipId ?? '';
        this.lineCount = this.retryRequest!.salesLineNum.length;
        this.salesOrderID = this.retryRequest!.SalesOrderID;
        this.errorMessage = '';
        this.errorPayload = '';
      },
      error: async (err: any) => {
        this.isRetrying = false;
        this.errorMessage = err?.error?.error?.message ?? err?.message ?? 'Failed to post picking list.';
        this.errorPayload = JSON.stringify(err?.error ?? err);
        const t = await this.toastCtrl.create({
          message: 'Retry failed. ' + this.errorMessage,
          duration: 4000, color: 'danger', position: 'bottom',
        });
        await t.present();
      }
    });
  }

  async copyError() {
    try {
      await navigator.clipboard.writeText(this.errorPayload);
      this.copied = true;
      setTimeout(() => (this.copied = false), 2000);
    } catch { /* clipboard unavailable */ }
  }
}

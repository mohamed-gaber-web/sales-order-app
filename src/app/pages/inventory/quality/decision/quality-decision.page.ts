import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { QualityService } from '../../../../core/services/quality.service';
import { QualityOrder, QualityDecision } from '../../../../models/quality.model';

@Component({
  selector: 'app-quality-decision',
  templateUrl: './quality-decision.page.html',
  styleUrls: ['./quality-decision.page.scss'],
  standalone: false,
})
export class QualityDecisionPage implements OnInit {
  qualityOrderId = '';
  order: QualityOrder | null = null;
  isLoading = false;
  isSubmitting = false;
  selectedDecision: QualityDecision | null = null;
  conditionNote = '';
  decisionSubmitted = false;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private qualityService = inject(QualityService);

  ngOnInit() {
    this.qualityOrderId = this.route.snapshot.paramMap.get('qoId') ?? '';
    this.load();
  }

  load() {
    if (!this.qualityOrderId) return;
    this.isLoading = true;
    this.qualityService.getOrder(this.qualityOrderId).subscribe({
      next: (order) => {
        this.order = order;
        this.selectedDecision = order.decision ?? (this.hasFailedTest(order) ? 'Reject' : 'Accept');
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        const toast = await this.toastCtrl.create({
          message: `Could not load ${this.qualityOrderId}.`,
          buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  hasFailedTest(order: QualityOrder): boolean {
    return order.tests.some(t => t.verdict === 'Fail');
  }

  get passCount(): number {
    return this.order?.tests.filter(t => t.verdict === 'Pass').length ?? 0;
  }

  get failCount(): number {
    return this.order?.tests.filter(t => t.verdict === 'Fail').length ?? 0;
  }

  selectDecision(decision: QualityDecision) {
    this.selectedDecision = decision;
  }

  async submit() {
    if (!this.order || !this.selectedDecision || this.isSubmitting) return;
    this.isSubmitting = true;

    const loading = await this.loadingCtrl.create({ message: 'Recording decision...', spinner: 'crescent' });
    await loading.present();

    this.qualityService.submitDecision(this.qualityOrderId, this.selectedDecision, this.conditionNote.trim() || undefined).subscribe({
      next: async (order) => {
        await loading.dismiss();
        this.isSubmitting = false;
        this.order = order;
        this.decisionSubmitted = true;
      },
      error: async () => {
        await loading.dismiss();
        this.isSubmitting = false;
        const toast = await this.toastCtrl.create({
          message: 'Could not record the decision. Try again.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  goToQueue() {
    this.router.navigate(['/inventory/quality']);
  }

  goToQuarantine() {
    this.router.navigate(['/inventory/quality/quarantine']);
  }
}

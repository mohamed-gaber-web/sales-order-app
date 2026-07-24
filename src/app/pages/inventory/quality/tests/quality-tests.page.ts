import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { QualityService } from '../../../../core/services/quality.service';
import { QualityOrder, QualityTest } from '../../../../models/quality.model';

@Component({
  selector: 'app-quality-tests',
  templateUrl: './quality-tests.page.html',
  styleUrls: ['./quality-tests.page.scss'],
  standalone: false,
})
export class QualityTestsPage implements OnInit {
  qualityOrderId = '';
  order: QualityOrder | null = null;
  isLoading = false;
  inputValues: Record<string, string> = {};

  private route = inject(ActivatedRoute);
  private router = inject(Router);
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

  get passedCount(): number {
    return this.order?.tests.filter(t => t.verdict === 'Pass').length ?? 0;
  }

  get failedCount(): number {
    return this.order?.tests.filter(t => t.verdict === 'Fail').length ?? 0;
  }

  get pendingTests(): QualityTest[] {
    return this.order?.tests.filter(t => t.verdict === 'Pending') ?? [];
  }

  get allDone(): boolean {
    return this.pendingTests.length === 0;
  }

  markPassFail(test: QualityTest, pass: boolean) {
    this.inputValues[test.testId] = pass ? 'pass' : 'fail';
    this.submitResult(test);
  }

  submitResult(test: QualityTest) {
    const raw = this.inputValues[test.testId];
    let value: number | boolean;
    if (test.kind === 'passfail') {
      if (raw !== 'pass' && raw !== 'fail') return;
      value = raw === 'pass';
    } else {
      const n = Number(raw);
      if (raw === undefined || raw === '' || isNaN(n)) return;
      value = n;
    }
    this.qualityService.submitTestResult(this.qualityOrderId, test.testId, value).subscribe({
      next: (order) => { this.order = order; },
      error: async () => {
        const toast = await this.toastCtrl.create({
          message: 'Could not save the result.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  goToDecision() {
    this.router.navigate(['/inventory/quality/decision', this.qualityOrderId]);
  }
}

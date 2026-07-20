import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { ProductionPickingListService } from '../../../../core/services/production-picking-list.service';
import { ProductionPickingJournal, ProductionPickingListEntry } from '../../../../models/inventory.model';

@Component({
  selector: 'app-production-picking-detail',
  templateUrl: './production-picking-detail.page.html',
  styleUrls: ['./production-picking-detail.page.scss'],
  standalone: false,
})
export class ProductionPickingDetailPage {
  journalNumber = '';
  journal?: ProductionPickingJournal;
  lines: ProductionPickingListEntry[] = [];
  isLoading = false;

  get totalConsumption(): number {
    return this.lines.reduce((sum, l) => sum + (l.ConsumptionBOMQuantity ?? 0), 0);
  }

  private route = inject(ActivatedRoute);
  private toastCtrl = inject(ToastController);
  private pickingListService = inject(ProductionPickingListService);

  constructor() {
    this.journal = (history.state as { journal?: ProductionPickingJournal }).journal;
  }

  ionViewWillEnter() {
    this.journalNumber = this.route.snapshot.paramMap.get('journalNumber') ?? '';
    this.loadLines();
  }

  loadLines(onDone?: () => void) {
    if (!this.journalNumber) return;
    this.isLoading = !this.lines.length;
    this.pickingListService.getJournalLines(this.journalNumber).subscribe({
      next: lines => {
        this.lines = lines;
        if (!this.journal && lines.length) {
          const first = lines[0];
          this.journal = {
            JournalNumber: first.JournalNumber,
            JournalName: first.JournalName,
            JournalDescription: first.JournalDescription,
            IsPosted: first.IsPosted,
            PostedDateTime: first.PostedDateTime,
            ProductionOrderNumber: first.ProductionOrderNumber,
            LineCount: lines.length,
            dataAreaId: first.dataAreaId,
          };
        }
        this.isLoading = false;
        onDone?.();
      },
      error: async () => {
        this.isLoading = false;
        onDone?.();
        const t = await this.toastCtrl.create({
          message: 'Could not load journal lines.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'danger',
          position: 'bottom',
        });
        await t.present();
      }
    });
  }

  doRefresh(event: CustomEvent) {
    this.loadLines(() => (event.target as HTMLIonRefresherElement).complete());
  }

  getStatusColor(isPosted?: string): string {
    return isPosted === 'Yes' ? 'var(--ds-success)' : 'var(--ds-warning)';
  }

  getStatusBg(isPosted?: string): string {
    return isPosted === 'Yes' ? 'var(--ds-success-soft)' : 'var(--ds-warning-soft)';
  }
}

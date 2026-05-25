import { Component } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';
import { ProjectItemJournalService, PIJJournalTable } from '../../../../core/services/project-item-journal.service';

@Component({
  selector: 'app-new-journal-modal',
  templateUrl: './new-journal-modal.component.html',
  styleUrls: ['./new-journal-modal.component.scss'],
  standalone: false,
})
export class NewJournalModalComponent {
  journalId: string;
  description = 'Project item journal — created via mobile';
  isCreating = false;
  private retried = false;

  constructor(
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private service: ProjectItemJournalService,
  ) {
    this.journalId = this.service.generateJournalId();
  }

  regenerateId() {
    this.journalId = this.service.generateJournalId();
    this.retried = false;
  }

  dismiss() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  create() {
    if (this.isCreating) return;
    this.isCreating = true;
    this.retried = false;
    const body: Partial<PIJJournalTable> = {
      dataAreaId: 'usmf',
      JournalId: this.journalId,
      JournalName: 'ProjItem',
      PostingDetailLevel: 'Detail',
      Description: this.description.trim() || 'Project item journal — created via mobile',
    };
    this.doCreate(body);
  }

  private doCreate(body: Partial<PIJJournalTable>) {
    this.service.createJournal(body).subscribe({
      next: (result) => {
        this.isCreating = false;
        this.modalCtrl.dismiss(result, 'created');
      },
      error: (err) => {
        if (err?.status === 409 && !this.retried) {
          this.retried = true;
          this.journalId = this.service.generateJournalId();
          body.JournalId = this.journalId;
          this.doCreate(body);
        } else {
          this.isCreating = false;
          const msg = this.extractErrorMessage(err) || 'Failed to create journal. Please try again.';
          this.showToast(msg);
        }
      }
    });
  }

  private extractErrorMessage(err: any): string {
    return err?.error?.error?.message
      ?? err?.error?.message
      ?? err?.message
      ?? '';
  }

  private async showToast(message: string) {
    const t = await this.toastCtrl.create({
      message,
      duration: 4000,
      color: 'danger',
      position: 'bottom',
    });
    await t.present();
  }
}

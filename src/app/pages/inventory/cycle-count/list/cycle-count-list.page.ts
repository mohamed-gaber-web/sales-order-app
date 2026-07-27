import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { CycleCountService } from '../../../../core/services/cycle-count.service';
import { CycleCountJournalHeader } from '../../../../models/inventory.model';

@Component({
  selector: 'app-cycle-count-list',
  templateUrl: './cycle-count-list.page.html',
  styleUrls: ['./cycle-count-list.page.scss'],
  standalone: false,
})
export class CycleCountListPage {
  journals: CycleCountJournalHeader[] = [];
  filteredJournals: CycleCountJournalHeader[] = [];
  searchTerm = '';
  isLoading = false;
  loadError = false;

  constructor(
    private router: Router,
    private toastCtrl: ToastController,
    private cycleCountService: CycleCountService,
  ) {}

  ionViewWillEnter() {
    this.loadJournals();
  }

  loadJournals() {
    this.isLoading = true;
    this.loadError = false;
    this.cycleCountService.getJournalHeaders().subscribe({
      next: (res) => {
        this.journals = res.value;
        this.applyFilter();
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        this.loadError = true;
        const toast = await this.toastCtrl.create({
          message: 'Could not load counting journals. Check your connection.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  doRefresh(event: CustomEvent) {
    this.cycleCountService.getJournalHeaders().subscribe({
      next: (res) => {
        this.journals = res.value;
        this.applyFilter();
        (event.target as HTMLIonRefresherElement).complete();
      },
      error: async () => {
        (event.target as HTMLIonRefresherElement).complete();
        const toast = await this.toastCtrl.create({
          message: 'Refresh failed. Try again.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  onSearchChange() {
    this.applyFilter();
  }

  private applyFilter() {
    if (!this.searchTerm.trim()) {
      this.filteredJournals = [...this.journals];
      return;
    }
    const t = this.searchTerm.toLowerCase();
    this.filteredJournals = this.journals.filter(
      j =>
        j.JournalNumber.toLowerCase().includes(t) ||
        (j.Description ?? '').toLowerCase().includes(t) ||
        (j.WorkerPersonnelNumber ?? '').toLowerCase().includes(t)
    );
  }

  openJournal(journalNumber: string) {
    this.router.navigate(['/inventory/cycle-count/detail', journalNumber]);
  }

  startCount() {
    this.router.navigate(['/inventory/cycle-count/count-by-barcode']);
  }

  goBack() { this.router.navigate(['/inventory']); }
}

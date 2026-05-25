import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ModalController, ToastController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ProjectItemJournalService, PIJJournalTable } from '../../../../core/services/project-item-journal.service';
import { NewJournalModalComponent } from './new-journal-modal.component';

@Component({
  selector: 'app-pij-list',
  templateUrl: './project-item-journal-list.page.html',
  styleUrls: ['./project-item-journal-list.page.scss'],
  standalone: false,
})
export class ProjectItemJournalListPage {
  journals: PIJJournalTable[] = [];
  filteredJournals: PIJJournalTable[] = [];
  searchTerm = '';
  isLoading = false;
  loadError = false;

  private searchSubject = new Subject<string>();

  get displayedJournals(): PIJJournalTable[] {
    return this.filteredJournals;
  }

  constructor(
    private router: Router,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private service: ProjectItemJournalService,
  ) {
    this.searchSubject.pipe(debounceTime(300), distinctUntilChanged()).subscribe(t => this.filterLocally(t));
  }

  ionViewWillEnter() {
    this.loadJournals();
  }

  loadJournals() {
    this.isLoading = true;
    this.loadError = false;
    this.journals = [];
    this.service.getJournals().subscribe({
      next: (res: any) => {
        const all: PIJJournalTable[] = res.value ?? [];
        // Keep only unposted journals — Posted can be 'No', false, or 0 depending on the D365 version
        this.journals = all.filter(j => !j.Posted || j.Posted === 'No' || j.Posted === false as any);
        this.filteredJournals = [...this.journals];
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.loadError = true;
      }
    });
  }

  doRefresh(event: CustomEvent) {
    this.loadJournals();
    setTimeout(() => (event.target as HTMLIonRefresherElement).complete(), 1000);
  }

  onQueryChange(term: string) {
    this.searchTerm = term;
    this.searchSubject.next(term);
  }

  private filterLocally(term: string) {
    if (!term.trim()) {
      this.filteredJournals = [...this.journals];
      return;
    }
    const t = term.toLowerCase();
    this.filteredJournals = this.journals.filter(j =>
      j.JournalId.toLowerCase().includes(t) ||
      j.JournalName.toLowerCase().includes(t) ||
      (j.Description ?? '').toLowerCase().includes(t)
    );
  }

  openJournal(journal: PIJJournalTable) {
    this.router.navigate(
      ['/inventory/project-item-journal/lines', journal.JournalId],
      { state: { journalName: journal.JournalName, description: journal.Description } }
    );
  }

  async openNewJournal() {
    const modal = await this.modalCtrl.create({
      component: NewJournalModalComponent,
      breakpoints: [0, 0.85, 1],
      initialBreakpoint: 0.85,
      handle: true,
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<PIJJournalTable>();
    if (role === 'created' && data) {
      this.router.navigate(
        ['/inventory/project-item-journal/lines', data.JournalId],
        { state: { journalName: data.JournalName, description: data.Description } }
      );
    }
  }
}

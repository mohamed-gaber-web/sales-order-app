import { Component, inject, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonInfiniteScroll, ToastController } from '@ionic/angular';
import { ProductionPickingListService } from '../../../../core/services/production-picking-list.service';
import { ProductionPickingJournal } from '../../../../models/inventory.model';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-production-picking-list',
  templateUrl: './production-picking-list.page.html',
  styleUrls: ['./production-picking-list.page.scss'],
  standalone: false,
})
export class ProductionPickingListPage {
  @ViewChild(IonInfiniteScroll) infiniteScroll!: IonInfiniteScroll;

  journals: ProductionPickingJournal[] = [];
  filteredJournals: ProductionPickingJournal[] = [];
  displayedJournals: ProductionPickingJournal[] = [];
  searchTerm = '';
  isLoading = false;

  get hasMore(): boolean {
    return this.displayedJournals.length < this.filteredJournals.length;
  }

  get postedCount(): number {
    return this.journals.filter(j => j.IsPosted === 'Yes').length;
  }

  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private pickingListService = inject(ProductionPickingListService);

  ionViewWillEnter() {
    if (!this.journals.length) this.loadJournals();
  }

  loadJournals(onDone?: () => void) {
    this.isLoading = !this.journals.length;
    this.pickingListService.getJournals().subscribe({
      next: journals => {
        this.journals = journals;
        this.applyFilter();
        this.isLoading = false;
        onDone?.();
      },
      error: async () => {
        this.isLoading = false;
        onDone?.();
        const t = await this.toastCtrl.create({
          message: 'Could not load picking list journals.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'danger',
          position: 'bottom',
        });
        await t.present();
      }
    });
  }

  onQueryChange(term: string) {
    this.searchTerm = term;
    this.applyFilter();
  }

  loadMore(event: CustomEvent) {
    const next = this.filteredJournals.slice(0, this.displayedJournals.length + PAGE_SIZE);
    this.displayedJournals = next;
    (event.target as HTMLIonInfiniteScrollElement).complete();
    if (this.infiniteScroll) this.infiniteScroll.disabled = !this.hasMore;
  }

  doRefresh(event: CustomEvent) {
    this.loadJournals(() => (event.target as HTMLIonRefresherElement).complete());
  }

  openJournal(journal: ProductionPickingJournal) {
    this.router.navigate(
      ['/inventory/production-picking', journal.JournalNumber],
      { state: { journal } }
    );
  }

  getStatusColor(isPosted: string): string {
    return isPosted === 'Yes' ? 'var(--ds-success)' : 'var(--ds-warning)';
  }

  getStatusBg(isPosted: string): string {
    return isPosted === 'Yes' ? 'var(--ds-success-soft)' : 'var(--ds-warning-soft)';
  }

  private applyFilter() {
    const t = this.searchTerm.trim().toLowerCase();
    this.filteredJournals = !t ? [...this.journals] : this.journals.filter(j =>
      j.JournalNumber.toLowerCase().includes(t) ||
      (j.ProductionOrderNumber ?? '').toLowerCase().includes(t) ||
      (j.JournalDescription ?? '').toLowerCase().includes(t) ||
      (j.JournalName ?? '').toLowerCase().includes(t)
    );
    this.displayedJournals = this.filteredJournals.slice(0, PAGE_SIZE);
    if (this.infiniteScroll) this.infiniteScroll.disabled = !this.hasMore;
  }
}

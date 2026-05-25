import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectItemJournalService, PIJJournalTrans } from '../../../../core/services/project-item-journal.service';

@Component({
  selector: 'app-pij-lines',
  templateUrl: './project-item-journal-lines.page.html',
  styleUrls: ['./project-item-journal-lines.page.scss'],
  standalone: false,
})
export class ProjectItemJournalLinesPage {
  journalId = '';
  journalName = '';
  description = '';
  lines: PIJJournalTrans[] = [];
  isLoading = false;
  loadError = false;

  get totalQty(): number {
    return this.lines.reduce((s, l) => s + (l.Quantity ?? 0), 0);
  }

  get totalCost(): number {
    return this.lines.reduce((s, l) => s + (l.CostAmount ?? 0), 0);
  }

  get currency(): string {
    return this.lines[0]?.ProjectSalesCurrencyId ?? 'USD';
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private service: ProjectItemJournalService,
  ) {}

  ionViewWillEnter() {
    const nav = this.router.getCurrentNavigation();
    const state = nav?.extras?.state ?? history.state;
    this.journalId = this.route.snapshot.paramMap.get('journalId') ?? '';
    this.journalName = state?.['journalName'] ?? '';
    this.description = state?.['description'] ?? '';
    this.loadLines();
  }

  loadLines() {
    if (!this.journalId) return;
    this.isLoading = true;
    this.loadError = false;
    this.service.getLines(this.journalId).subscribe({
      next: (res: any) => {
        this.lines = res.value ?? [];
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.loadError = true;
      }
    });
  }

  doRefresh(event: CustomEvent) {
    this.loadLines();
    setTimeout(() => (event.target as HTMLIonRefresherElement).complete(), 1000);
  }

  goAddLine() {
    this.router.navigate(
      ['/inventory/project-item-journal/new-line'],
      { state: { journalId: this.journalId, journalName: this.journalName } }
    );
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatQty(qty?: number): string {
    if (qty == null) return '0';
    return Number.isInteger(qty) ? String(qty) : qty.toFixed(4).replace(/\.?0+$/, '');
  }
}

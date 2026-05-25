import { Component, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonInfiniteScroll, ToastController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ProjectItemRequirementsService, PIRProject } from '../../../../core/services/project-item-requirements.service';

type FilterId = 'all' | 'inProcess' | 'completed' | 'recent';

@Component({
  selector: 'app-pir-list',
  templateUrl: './project-item-requirements-list.page.html',
  styleUrls: ['./project-item-requirements-list.page.scss'],
  standalone: false,
})
export class ProjectItemRequirementsListPage {
  @ViewChild(IonInfiniteScroll) infiniteScroll!: IonInfiniteScroll;

  projects: PIRProject[] = [];
  allProjects: PIRProject[] = [];
  filteredProjects: PIRProject[] = [];
  searchTerm = '';
  isLoading = false;
  isSearching = false;
  loadError = false;
  totalCount = 0;
  activeFilter: FilterId = 'all';
  private allDataLoaded = false;

  readonly filterChips: { id: FilterId; label: string; icon: string }[] = [
    { id: 'all',       label: 'All',        icon: 'apps-outline' },
    { id: 'inProcess', label: 'In Process', icon: 'play-circle-outline' },
    { id: 'completed', label: 'Completed',  icon: 'checkmark-circle-outline' },
    { id: 'recent',    label: 'Recent',     icon: 'time-outline' },
  ];

  private searchSubject = new Subject<string>();

  get displayedProjects(): PIRProject[] {
    if (this.activeFilter === 'all') return this.filteredProjects;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return this.filteredProjects.filter(p => {
      switch (this.activeFilter) {
        case 'inProcess': return (p.ProjectStage ?? '').toLowerCase() === 'inprocess';
        case 'completed': return (p.ProjectStage ?? '').toLowerCase() === 'completed';
        case 'recent': {
          const d = new Date(p.StartDate1 ?? p.ActualStartDate ?? '');
          return !isNaN(d.getTime()) && d >= thirtyDaysAgo;
        }
        default: return true;
      }
    });
  }

  get canLoadMore(): boolean {
    return !this.searchTerm.trim() && this.activeFilter === 'all' && this.projects.length < this.totalCount;
  }

  constructor(
    private router: Router,
    private toastCtrl: ToastController,
    private service: ProjectItemRequirementsService,
  ) {
    this.searchSubject.pipe(debounceTime(400), distinctUntilChanged()).subscribe(t => this.handleSearch(t));
  }

  ionViewWillEnter() {
    this.allDataLoaded = false;
    this.allProjects = [];
    this.loadProjects();
  }

  loadProjects() {
    this.isLoading = true;
    this.loadError = false;
    this.projects = [];
    this.totalCount = 0;
    this.service.getProjects(0).subscribe({
      next: (res: any) => {
        this.projects = res.value ?? [];
        this.filteredProjects = [...this.projects];
        this.totalCount = res['@odata.count'] ?? res.value?.length ?? 0;
        this.isLoading = false;
        if (this.infiniteScroll) this.infiniteScroll.disabled = !this.canLoadMore;
      },
      error: () => {
        this.isLoading = false;
        this.loadError = true;
      }
    });
  }

  loadMore(event: CustomEvent) {
    if (!this.canLoadMore) { (event.target as HTMLIonInfiniteScrollElement).complete(); return; }
    this.service.getProjects(this.projects.length).subscribe({
      next: (res: any) => {
        this.projects = [...this.projects, ...(res.value ?? [])];
        this.filteredProjects = [...this.projects];
        (event.target as HTMLIonInfiniteScrollElement).complete();
        if (!this.canLoadMore && this.infiniteScroll) this.infiniteScroll.disabled = true;
      },
      error: () => (event.target as HTMLIonInfiniteScrollElement).complete(),
    });
  }

  onQueryChange(term: string) {
    this.searchTerm = term;
    this.searchSubject.next(term);
  }

  setFilter(id: FilterId) { this.activeFilter = id; }

  doRefresh(event: CustomEvent) {
    this.allDataLoaded = false;
    this.allProjects = [];
    this.activeFilter = 'all';
    this.loadProjects();
    setTimeout(() => (event.target as HTMLIonRefresherElement).complete(), 1000);
  }

  openProject(project: PIRProject) {
    this.router.navigate(
      ['/inventory/project-item-requirements/requirements', project.ProjectID],
      {
        state: {
          projectName: project.ProjectName,
          customerAccount: project.CustomerAccount,
          projectStage: project.ProjectStage,
          projectContractId: project.ProjectContractID,
        }
      }
    );
  }

  private handleSearch(term: string) {
    if (!term.trim()) {
      this.filteredProjects = [...this.projects];
      if (this.infiniteScroll) this.infiniteScroll.disabled = !this.canLoadMore;
      return;
    }
    if (this.allDataLoaded) { this.filterLocally(term); return; }
    this.isSearching = true;
    this.service.getAllProjects().subscribe({
      next: (res: any) => {
        this.allProjects = res.value ?? [];
        this.allDataLoaded = true;
        this.isSearching = false;
        this.filterLocally(term);
        if (this.infiniteScroll) this.infiniteScroll.disabled = true;
      },
      error: () => { this.isSearching = false; }
    });
  }

  private filterLocally(term: string) {
    const t = term.toLowerCase();
    this.filteredProjects = this.allProjects.filter(p =>
      p.ProjectID.toLowerCase().includes(t) ||
      p.ProjectName.toLowerCase().includes(t) ||
      (p.CustomerAccount ?? '').toLowerCase().includes(t) ||
      (p.DeliveryName ?? '').toLowerCase().includes(t)
    );
  }

  getStageColor(stage?: string): string {
    switch ((stage ?? '').toLowerCase()) {
      case 'inprocess':  return '#16a34a';
      case 'completed':  return '#6b7280';
      case 'created':    return '#2563eb';
      case 'stopped':    return '#dc2626';
      default:           return '#d97706';
    }
  }

  getStageLabel(stage?: string): string {
    switch ((stage ?? '').toLowerCase()) {
      case 'inprocess':  return 'In Process';
      case 'completed':  return 'Completed';
      case 'created':    return 'Created';
      case 'stopped':    return 'Stopped';
      default:           return stage ?? 'Unknown';
    }
  }

  getStageBg(stage?: string): string {
    switch ((stage ?? '').toLowerCase()) {
      case 'inprocess':  return 'rgba(22,163,74,.12)';
      case 'completed':  return 'rgba(107,114,128,.12)';
      case 'created':    return 'rgba(37,99,235,.12)';
      case 'stopped':    return 'rgba(220,38,38,.12)';
      default:           return 'rgba(217,119,6,.12)';
    }
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}

import { Component, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonInfiniteScroll, ToastController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ProjectIssuanceService, Project } from '../../../../core/services/project-issuance.service';

@Component({
  selector: 'app-project-issuance-list',
  templateUrl: './project-issuance-list.page.html',
  styleUrls: ['./project-issuance-list.page.scss'],
  standalone: false,
})
export class ProjectIssuanceListPage {
  @ViewChild(IonInfiniteScroll) infiniteScroll!: IonInfiniteScroll;

  projects: Project[] = [];
  allProjects: Project[] = [];
  filteredProjects: Project[] = [];
  searchTerm = '';
  isLoading = false;
  isLoadingMore = false;
  isSearching = false;
  totalCount = 0;
  private allDataLoaded = false;

  private searchSubject = new Subject<string>();

  get hasMore(): boolean {
    return !this.searchTerm.trim() && this.projects.length < this.totalCount;
  }

  constructor(
    private router: Router,
    private toastCtrl: ToastController,
    private service: ProjectIssuanceService,
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
    this.projects = [];
    this.totalCount = 0;
    this.service.getProjects(0).subscribe({
      next: res => {
        this.projects = res.value;
        this.filteredProjects = [...this.projects];
        this.totalCount = res['@odata.count'] ?? res.value.length;
        this.isLoading = false;
        if (this.infiniteScroll) this.infiniteScroll.disabled = !this.hasMore;
      },
      error: async () => {
        this.isLoading = false;
        const t = await this.toastCtrl.create({ message: 'Could not load projects.', duration: 3000, color: 'danger', position: 'bottom' });
        await t.present();
      }
    });
  }

  loadMore(event: CustomEvent) {
    if (!this.hasMore) { (event.target as HTMLIonInfiniteScrollElement).complete(); return; }
    this.isLoadingMore = true;
    this.service.getProjects(this.projects.length).subscribe({
      next: res => {
        this.projects = [...this.projects, ...res.value];
        this.filteredProjects = [...this.projects];
        this.isLoadingMore = false;
        (event.target as HTMLIonInfiniteScrollElement).complete();
        if (!this.hasMore && this.infiniteScroll) this.infiniteScroll.disabled = true;
      },
      error: async () => {
        this.isLoadingMore = false;
        (event.target as HTMLIonInfiniteScrollElement).complete();
      }
    });
  }

  onSearchChange() { this.searchSubject.next(this.searchTerm.trim()); }

  private handleSearch(term: string) {
    if (!term) {
      this.filteredProjects = [...this.projects];
      if (this.infiniteScroll) this.infiniteScroll.disabled = !this.hasMore;
      return;
    }
    if (this.allDataLoaded) { this.filterLocally(term); return; }
    this.isSearching = true;
    this.service.getAllProjects().subscribe({
      next: res => {
        this.allProjects = res.value;
        this.allDataLoaded = true;
        this.isSearching = false;
        this.filterLocally(term);
        if (this.infiniteScroll) this.infiniteScroll.disabled = true;
      },
      error: async () => { this.isSearching = false; }
    });
  }

  private filterLocally(term: string) {
    const t = term.toLowerCase();
    this.filteredProjects = this.allProjects.filter(p =>
      p.ProjectID.toLowerCase().includes(t) ||
      p.Name.toLowerCase().includes(t) ||
      (p.CustomerAccount ?? '').toLowerCase().includes(t)
    );
  }

  openProject(project: Project) {
    this.router.navigate(
      ['/inventory/project-issuance/detail', project.ProjectID],
      { state: { projectName: project.Name, customerAccount: project.CustomerAccount, projectStage: project.ProjectStage, dataAreaId: project.dataAreaId } }
    );
  }

  doRefresh(event: CustomEvent) {
    this.allDataLoaded = false;
    this.allProjects = [];
    this.loadProjects();
    setTimeout(() => (event.target as HTMLIonRefresherElement).complete(), 1000);
  }

  getStageColor(stage?: string): string {
    switch ((stage ?? '').toLowerCase()) {
      case 'inprocess': return '#16a34a';
      case 'created':   return '#2563eb';
      case 'finished':  return '#6b7280';
      default:          return '#d97706';
    }
  }

  getStageLabel(stage?: string): string {
    switch ((stage ?? '').toLowerCase()) {
      case 'inprocess': return 'In Process';
      case 'created':   return 'Created';
      case 'finished':  return 'Finished';
      default:          return stage ?? 'Unknown';
    }
  }

  getStageBg(stage?: string): string {
    switch ((stage ?? '').toLowerCase()) {
      case 'inprocess': return 'rgba(22,163,74,.12)';
      case 'created':   return 'rgba(37,99,235,.12)';
      case 'finished':  return 'rgba(107,114,128,.12)';
      default:          return 'rgba(217,119,6,.12)';
    }
  }
}

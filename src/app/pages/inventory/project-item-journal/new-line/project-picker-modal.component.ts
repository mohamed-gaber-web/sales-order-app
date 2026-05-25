import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ProjectItemJournalService, PIJProject } from '../../../../core/services/project-item-journal.service';

@Component({
  selector: 'app-project-picker-modal',
  templateUrl: './project-picker-modal.component.html',
  styleUrls: ['./project-picker-modal.component.scss'],
  standalone: false,
})
export class ProjectPickerModalComponent implements OnInit {
  projects: PIJProject[] = [];
  filteredProjects: PIJProject[] = [];
  isLoading = false;
  loadError = false;
  searchTerm = '';

  private searchSubject = new Subject<string>();

  constructor(
    private modalCtrl: ModalController,
    private service: ProjectItemJournalService,
  ) {
    this.searchSubject.pipe(debounceTime(250), distinctUntilChanged()).subscribe(t => this.filter(t));
  }

  ngOnInit() {
    this.load();
  }

  load() {
    this.isLoading = true;
    this.loadError = false;
    this.service.getProjects().subscribe({
      next: (res: any) => {
        this.projects = res.value ?? [];
        this.filteredProjects = [...this.projects];
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.loadError = true;
      }
    });
  }

  onSearch(term: string) {
    this.searchTerm = term;
    this.searchSubject.next(term);
  }

  private filter(term: string) {
    if (!term.trim()) {
      this.filteredProjects = [...this.projects];
      return;
    }
    const t = term.toLowerCase();
    this.filteredProjects = this.projects.filter(p =>
      p.ProjectID.toLowerCase().includes(t) ||
      (p.Name ?? '').toLowerCase().includes(t)
    );
  }

  select(project: PIJProject) {
    this.modalCtrl.dismiss(project, 'selected');
  }

  dismiss() {
    this.modalCtrl.dismiss(null, 'cancel');
  }
}

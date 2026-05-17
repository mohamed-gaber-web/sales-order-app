import { Component } from '@angular/core';
import { Router } from '@angular/router';

export interface WorkItem {
  workId: string;
  workType: 'Picking' | 'Putting';
  referenceId: string;
  status: 'Open' | 'InProgress' | 'Completed';
  assignedTo?: string;
}

@Component({
  selector: 'app-pick-put-list',
  templateUrl: './pick-put-list.page.html',
  styleUrls: ['./pick-put-list.page.scss'],
  standalone: false,
})
export class PickPutListPage {
  segment: 'my' | 'all' = 'my';

  myWork: WorkItem[] = [
    {
      workId: 'WRK-0041',
      workType: 'Picking',
      referenceId: 'SO-00123',
      status: 'Open',
      assignedTo: 'Current User',
    },
    {
      workId: 'WRK-0038',
      workType: 'Putting',
      referenceId: 'TO-00077',
      status: 'InProgress',
      assignedTo: 'Current User',
    },
  ];

  allWork: WorkItem[] = [
    ...this.myWork,
    {
      workId: 'WRK-0039',
      workType: 'Picking',
      referenceId: 'SO-00118',
      status: 'Open',
      assignedTo: 'Jane Smith',
    },
    {
      workId: 'WRK-0040',
      workType: 'Putting',
      referenceId: 'TO-00074',
      status: 'Completed',
      assignedTo: 'Bob Jones',
    },
  ];

  constructor(private router: Router) {}

  goBack(): void {
    this.router.navigate(['/inventory']);
  }

  segmentChanged(event: CustomEvent): void {
    this.segment = event.detail.value;
  }

  get visibleWork(): WorkItem[] {
    return this.segment === 'my' ? this.myWork : this.allWork;
  }

  openWork(item: WorkItem): void {
    this.router.navigate(['/inventory/pick-put/work', item.workId], {
      state: { workItem: item },
    });
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'Open':       return 'primary';
      case 'InProgress': return 'warning';
      case 'Completed':  return 'success';
      default:           return 'medium';
    }
  }

  getWorkTypeColor(type: string): string {
    return type === 'Picking' ? 'tertiary' : 'secondary';
  }
}

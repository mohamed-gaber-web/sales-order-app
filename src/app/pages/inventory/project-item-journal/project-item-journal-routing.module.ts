import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./list/project-item-journal-list.module').then(m => m.ProjectItemJournalListModule)
  },
  {
    path: 'lines/:journalId',
    loadChildren: () => import('./lines/project-item-journal-lines.module').then(m => m.ProjectItemJournalLinesModule)
  },
  {
    path: 'new-line',
    loadChildren: () => import('./new-line/project-item-journal-new-line.module').then(m => m.ProjectItemJournalNewLineModule)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProjectItemJournalRoutingModule {}

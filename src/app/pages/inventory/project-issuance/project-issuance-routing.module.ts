import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./list/project-issuance-list.module').then(m => m.ProjectIssuanceListModule)
  },
  {
    path: 'detail/:projectId',
    loadChildren: () => import('./detail/project-issuance-detail.module').then(m => m.ProjectIssuanceDetailModule)
  },
  {
    path: 'line/:projectId/:lineNumber',
    loadChildren: () => import('./line-detail/project-issuance-line-detail.module').then(m => m.ProjectIssuanceLineDetailModule)
  },
  {
    path: 'adhoc/:projectId',
    loadChildren: () => import('./adhoc/project-issuance-adhoc.module').then(m => m.ProjectIssuanceAdhocModule)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProjectIssuanceRoutingModule {}

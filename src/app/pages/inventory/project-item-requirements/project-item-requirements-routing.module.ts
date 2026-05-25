import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./list/project-item-requirements-list.module').then(m => m.ProjectItemRequirementsListModule)
  },
  {
    path: 'requirements/:projectId',
    loadChildren: () => import('./requirements/project-item-requirements-req.module').then(m => m.ProjectItemRequirementsReqModule)
  },
  {
    path: 'result',
    loadChildren: () => import('./result/project-item-requirements-result.module').then(m => m.ProjectItemRequirementsResultModule)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProjectItemRequirementsRoutingModule {}

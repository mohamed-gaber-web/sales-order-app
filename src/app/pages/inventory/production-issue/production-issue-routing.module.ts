import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./list/production-issue-list.module').then(m => m.ProductionIssueListModule)
  },
  {
    path: 'issue/:orderNumber',
    loadChildren: () => import('./form/production-issue-form.module').then(m => m.ProductionIssueFormModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProductionIssueRoutingModule {}

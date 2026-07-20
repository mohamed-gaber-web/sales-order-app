import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./list/production-picking-list.module').then(m => m.ProductionPickingListModule)
  },
  {
    path: ':journalNumber',
    loadChildren: () => import('./detail/production-picking-detail.module').then(m => m.ProductionPickingDetailModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProductionPickingRoutingModule {}

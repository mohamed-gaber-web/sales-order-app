import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'list',
    pathMatch: 'full'
  },
  {
    path: 'list',
    loadChildren: () => import('./list/sales-order-list.module').then(m => m.SalesOrderListModule)
  },
  {
    path: 'create',
    loadChildren: () => import('./form/sales-order-form.module').then(m => m.SalesOrderFormModule)
  },
  {
    path: 'edit/:id',
    loadChildren: () => import('./form/sales-order-form.module').then(m => m.SalesOrderFormModule)
  },
  {
    path: 'view/:id',
    loadChildren: () => import('./detail/sales-order-detail.module').then(m => m.SalesOrderDetailModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SalesOrderRoutingModule {}

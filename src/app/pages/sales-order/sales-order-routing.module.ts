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
    path: 'return-list',
    data: { mode: 'return' },
    loadChildren: () => import('./list/sales-order-list.module').then(m => m.SalesOrderListModule)
  },
  {
    path: 'line-reservation',
    data: { action: 'reserve' },
    loadChildren: () => import('./line-action/sales-line-action.module').then(m => m.SalesLineActionModule)
  },
  {
    path: 'line-pick',
    data: { action: 'pick' },
    loadChildren: () => import('./line-action/sales-line-action.module').then(m => m.SalesLineActionModule)
  },
  {
    path: 'line-registration',
    data: { action: 'register' },
    loadChildren: () => import('./line-action/sales-line-action.module').then(m => m.SalesLineActionModule)
  },
  {
    path: 'line-cancel-remainder',
    data: { action: 'cancelRemainder' },
    loadChildren: () => import('./line-action/sales-line-action.module').then(m => m.SalesLineActionModule)
  },
  {
    path: 'line-cancel-partial',
    data: { action: 'cancelPartial' },
    loadChildren: () => import('./line-action/sales-line-action.module').then(m => m.SalesLineActionModule)
  },
  {
    path: 'create',
    loadChildren: () => import('./form/sales-order-form.module').then(m => m.SalesOrderFormModule)
  },
  {
    path: 'scan',
    loadChildren: () => import('./scan/sales-order-scan.module').then(m => m.SalesOrderScanModule)
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

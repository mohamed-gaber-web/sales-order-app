import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: 'detail/:salesOrderNumber',
    loadChildren: () =>
      import('./detail/sales-order-line-detail.module').then(
        (m) => m.SalesOrderLineDetailModule
      ),
  },
  {
    path: 'create/:salesOrderNumber',
    loadChildren: () =>
      import('./form/sales-order-line-form.module').then(
        (m) => m.SalesOrderLineFormModule
      ),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SalesOrderLineRoutingModule {}

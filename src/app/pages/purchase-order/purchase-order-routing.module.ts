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
    loadChildren: () => import('./list/purchase-order-list.module').then(m => m.PurchaseOrderListModule)
  },
  {
    path: 'detail/:poNumber',
    loadChildren: () => import('./detail/purchase-order-detail.module').then(m => m.PurchaseOrderDetailModule)
  },
  {
    path: 'receive/:poNumber/:lineNumber',
    loadChildren: () => import('./receive/purchase-order-receive.module').then(m => m.PurchaseOrderReceiveModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PurchaseOrderRoutingModule {}

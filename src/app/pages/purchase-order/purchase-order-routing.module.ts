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
    path: 'receive-by-barcode',
    loadChildren: () => import('./select-po/purchase-order-select-po.module').then(m => m.PurchaseOrderSelectPoModule)
  },
  {
    path: 'receive-by-barcode/:poNumber/confirm',
    loadChildren: () => import('./confirm-receive/purchase-order-confirm-receive.module').then(m => m.PurchaseOrderConfirmReceiveModule)
  },
  {
    path: 'receive-by-barcode/:poNumber',
    loadChildren: () => import('./scan-receive/purchase-order-scan-receive.module').then(m => m.PurchaseOrderScanReceiveModule)
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

import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./select-po/purchase-order-register-select-po.module').then(m => m.PurchaseOrderRegisterSelectPoModule)
  },
  {
    path: ':poNumber',
    loadChildren: () => import('./scan-register/purchase-order-scan-register.module').then(m => m.PurchaseOrderScanRegisterModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PurchaseOrderRegisterRoutingModule {}

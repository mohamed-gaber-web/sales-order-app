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
    loadChildren: () => import('./list/transfer-order-list.module').then(m => m.TransferOrderListModule)
  },
  {
    path: 'detail/:transferId',
    loadChildren: () => import('./detail/transfer-order-detail.module').then(m => m.TransferOrderDetailModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TransferOrderRoutingModule {}

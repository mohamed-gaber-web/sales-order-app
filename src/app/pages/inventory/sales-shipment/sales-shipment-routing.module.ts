import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./list/sales-shipment-list.module').then(m => m.SalesShipmentListModule)
  },
  {
    path: 'ship/:soNumber',
    loadChildren: () => import('./ship/sales-shipment-ship.module').then(m => m.SalesShipmentShipModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SalesShipmentRoutingModule {}

import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () =>
      import('./list/transfer-ship-list.module').then(m => m.TransferShipListModule),
  },
  {
    path: 'ship/:toNumber',
    loadChildren: () =>
      import('./action/transfer-ship-action.module').then(m => m.TransferShipActionModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TransferShipRoutingModule {}

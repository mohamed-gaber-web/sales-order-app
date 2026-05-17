import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () =>
      import('./list/transfer-receive-list.module').then(m => m.TransferReceiveListModule),
  },
  {
    path: 'receive/:toNumber',
    loadChildren: () =>
      import('./action/transfer-receive-action.module').then(m => m.TransferReceiveActionModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TransferReceiveRoutingModule {}

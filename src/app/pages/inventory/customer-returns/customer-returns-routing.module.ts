import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./list/customer-returns-list.module').then(m => m.CustomerReturnsListModule)
  },
  {
    path: 'receive/:returnNumber',
    loadChildren: () => import('./receive/customer-returns-receive.module').then(m => m.CustomerReturnsReceiveModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CustomerReturnsRoutingModule {}

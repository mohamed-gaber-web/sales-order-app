import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./list/vendor-returns-list.module').then(m => m.VendorReturnsListModule)
  },
  {
    path: 'return/:poNumber',
    loadChildren: () => import('./form/vendor-returns-form.module').then(m => m.VendorReturnsFormModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class VendorReturnsRoutingModule {}

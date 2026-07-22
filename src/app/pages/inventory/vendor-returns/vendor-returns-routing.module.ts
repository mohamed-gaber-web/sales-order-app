import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./list/vendor-returns-list.module').then(m => m.VendorReturnsListModule)
  },
  {
    path: 'select-po',
    loadChildren: () => import('./select-po/vendor-returns-select-po.module').then(m => m.VendorReturnsSelectPoModule)
  },
  {
    path: 'scan/:poNumber',
    loadChildren: () => import('./scan/vendor-returns-scan.module').then(m => m.VendorReturnsScanModule)
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

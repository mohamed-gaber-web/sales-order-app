import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./list/cycle-count-list.module').then(m => m.CycleCountListModule)
  },
  {
    path: 'detail/:journalNumber',
    loadChildren: () => import('./form/cycle-count-form.module').then(m => m.CycleCountFormModule)
  },
  {
    path: 'count-by-barcode',
    loadChildren: () => import('./start/cycle-count-start.module').then(m => m.CycleCountStartModule)
  },
  {
    path: 'count-by-barcode/scan',
    loadChildren: () => import('./scan/cycle-count-scan.module').then(m => m.CycleCountScanModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CycleCountRoutingModule {}

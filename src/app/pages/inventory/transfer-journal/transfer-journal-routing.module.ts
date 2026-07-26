import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./select-so/transfer-journal-select-so.module').then(m => m.TransferJournalSelectSoModule)
  },
  {
    path: 'from-to/:soNumber',
    loadChildren: () => import('./from-to/transfer-journal-from-to.module').then(m => m.TransferJournalFromToModule)
  },
  {
    path: 'scan/:soNumber',
    loadChildren: () => import('./scan/transfer-journal-scan.module').then(m => m.TransferJournalScanModule)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TransferJournalRoutingModule {}

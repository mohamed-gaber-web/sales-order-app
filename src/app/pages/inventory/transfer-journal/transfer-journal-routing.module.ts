import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./from-to/transfer-journal-from-to.module').then(m => m.TransferJournalFromToModule)
  },
  {
    path: 'scan',
    loadChildren: () => import('./scan/transfer-journal-scan.module').then(m => m.TransferJournalScanModule)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TransferJournalRoutingModule {}

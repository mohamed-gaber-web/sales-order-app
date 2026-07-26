import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { TransferJournalSelectSoPage } from './transfer-journal-select-so.page';
import { DesignSystemModule } from '../../../../shared/design-system/design-system.module';
import { ScannerModalModule } from '../../scanner/scanner-modal.module';

const routes: Routes = [
  {
    path: '',
    component: TransferJournalSelectSoPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    DesignSystemModule,
    ScannerModalModule
  ],
  declarations: [TransferJournalSelectSoPage]
})
export class TransferJournalSelectSoModule {}

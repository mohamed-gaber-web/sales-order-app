import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { TransferJournalFromToPage } from './transfer-journal-from-to.page';
import { DesignSystemModule } from '../../../../shared/design-system/design-system.module';

const routes: Routes = [
  {
    path: '',
    component: TransferJournalFromToPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    DesignSystemModule
  ],
  declarations: [TransferJournalFromToPage]
})
export class TransferJournalFromToModule {}

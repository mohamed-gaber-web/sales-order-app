import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { TransferLineListPage } from './list/transfer-line-list.page';
import { TransferLineActionPage } from './action/transfer-line-action.page';

// One module serves Reservation, Pick and Registration; the parent route's
// `data.action` decides which one this instance is.
const routes: Routes = [
  { path: '', component: TransferLineListPage },
  { path: ':toNumber', component: TransferLineActionPage },
];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes), TranslatePipe],
  declarations: [TransferLineListPage, TransferLineActionPage],
})
export class TransferLineActionModule {}

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { TransferReceiveListPage } from './transfer-receive-list.page';

const routes: Routes = [
  {
    path: '',
    component: TransferReceiveListPage,
  },
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
  ],
  declarations: [TransferReceiveListPage],
})
export class TransferReceiveListModule {}

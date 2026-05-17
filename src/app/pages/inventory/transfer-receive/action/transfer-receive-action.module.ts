import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { TransferReceiveActionPage } from './transfer-receive-action.page';

const routes: Routes = [
  {
    path: '',
    component: TransferReceiveActionPage,
  },
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    RouterModule.forChild(routes),
  ],
  declarations: [TransferReceiveActionPage],
})
export class TransferReceiveActionModule {}

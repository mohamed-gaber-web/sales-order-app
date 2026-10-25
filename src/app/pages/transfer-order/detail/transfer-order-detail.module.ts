import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { TransferOrderDetailPage } from './transfer-order-detail.page';
import { TranslatePipe } from '@ngx-translate/core';
import { TransferLineDialogModule } from '../../inventory/transfer-line-action/line-dialog/transfer-line-dialog.module';

const routes: Routes = [
  {
    path: '',
    component: TransferOrderDetailPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes), TranslatePipe, TransferLineDialogModule],
  declarations: [TransferOrderDetailPage]
})
export class TransferOrderDetailModule {}

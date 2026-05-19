import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { TransferOrderListPage } from './transfer-order-list.page';
import { DesignSystemModule } from '../../../shared/design-system/design-system.module';

const routes: Routes = [
  {
    path: '',
    component: TransferOrderListPage
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
  declarations: [TransferOrderListPage]
})
export class TransferOrderListModule {}

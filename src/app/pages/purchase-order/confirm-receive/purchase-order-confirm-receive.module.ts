import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { DesignSystemModule } from '../../../shared/design-system/design-system.module';
import { PurchaseOrderConfirmReceivePage } from './purchase-order-confirm-receive.page';

const routes: Routes = [
  {
    path: '',
    component: PurchaseOrderConfirmReceivePage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    DesignSystemModule
  ],
  declarations: [PurchaseOrderConfirmReceivePage]
})
export class PurchaseOrderConfirmReceiveModule {}

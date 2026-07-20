import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { PurchaseOrderReceivePage } from './purchase-order-receive.page';
import { ScannerModalModule } from '../../inventory/scanner/scanner-modal.module';

const routes: Routes = [
  {
    path: '',
    component: PurchaseOrderReceivePage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    ScannerModalModule
  ],
  declarations: [PurchaseOrderReceivePage]
})
export class PurchaseOrderReceiveModule {}

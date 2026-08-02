import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { PurchaseOrderRegisterSelectPoPage } from './purchase-order-register-select-po.page';
import { DesignSystemModule } from '../../../shared/design-system/design-system.module';
import { ScannerModalModule } from '../../inventory/scanner/scanner-modal.module';

const routes: Routes = [
  {
    path: '',
    component: PurchaseOrderRegisterSelectPoPage
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
  declarations: [PurchaseOrderRegisterSelectPoPage]
})
export class PurchaseOrderRegisterSelectPoModule {}

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { PurchaseOrderScanRegisterPage } from './purchase-order-scan-register.page';
import { DesignSystemModule } from '../../../shared/design-system/design-system.module';
import { ScannerModalModule } from '../../inventory/scanner/scanner-modal.module';
import { LabelPreviewModalModule } from '../../purchase-order/label-preview/label-preview-modal.module';

const routes: Routes = [
  {
    path: '',
    component: PurchaseOrderScanRegisterPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    DesignSystemModule,
    ScannerModalModule,
    LabelPreviewModalModule
  ],
  declarations: [PurchaseOrderScanRegisterPage]
})
export class PurchaseOrderScanRegisterModule {}

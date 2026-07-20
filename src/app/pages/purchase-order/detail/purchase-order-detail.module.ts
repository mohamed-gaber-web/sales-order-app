import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { DesignSystemModule } from '../../../shared/design-system/design-system.module';
import { ScannerModalModule } from '../../inventory/scanner/scanner-modal.module';
import { PurchaseOrderDetailPage } from './purchase-order-detail.page';

const routes: Routes = [
  {
    path: '',
    component: PurchaseOrderDetailPage
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
  declarations: [PurchaseOrderDetailPage]
})
export class PurchaseOrderDetailModule {}

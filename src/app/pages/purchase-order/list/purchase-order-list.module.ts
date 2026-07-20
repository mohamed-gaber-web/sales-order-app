import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { PurchaseOrderListPage } from './purchase-order-list.page';
import { DesignSystemModule } from '../../../shared/design-system/design-system.module';
import { ScannerModalModule } from '../../inventory/scanner/scanner-modal.module';

const routes: Routes = [
  {
    path: '',
    component: PurchaseOrderListPage
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
  declarations: [PurchaseOrderListPage]
})
export class PurchaseOrderListModule {}

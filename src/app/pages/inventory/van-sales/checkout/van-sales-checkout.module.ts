import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { VanSalesCheckoutPage } from './van-sales-checkout.page';
import { DesignSystemModule } from '../../../../shared/design-system/design-system.module';
import { VanSalesLabelModalModule } from '../label/van-sales-label-modal.module';

const routes: Routes = [
  {
    path: '',
    component: VanSalesCheckoutPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    DesignSystemModule,
    VanSalesLabelModalModule
  ],
  declarations: [VanSalesCheckoutPage]
})
export class VanSalesCheckoutModule {}

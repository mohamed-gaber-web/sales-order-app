import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { PurchaseOrderCreatePage } from './purchase-order-create.page';
import { DesignSystemModule } from '../../../shared/design-system/design-system.module';

const routes: Routes = [
  {
    path: '',
    component: PurchaseOrderCreatePage,
  },
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    DesignSystemModule,
  ],
  declarations: [PurchaseOrderCreatePage],
})
export class PurchaseOrderCreateModule {}

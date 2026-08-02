import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { PurchaseOrderRegisterRoutingModule } from './purchase-order-register-routing.module';
import { DesignSystemModule } from '../../shared/design-system/design-system.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    PurchaseOrderRegisterRoutingModule,
    DesignSystemModule
  ]
})
export class PurchaseOrderRegisterModule {}

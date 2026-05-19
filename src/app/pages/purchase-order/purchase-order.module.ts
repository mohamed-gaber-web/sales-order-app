import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { PurchaseOrderRoutingModule } from './purchase-order-routing.module';
import { DesignSystemModule } from '../../shared/design-system/design-system.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    PurchaseOrderRoutingModule,
    DesignSystemModule
  ]
})
export class PurchaseOrderModule {}

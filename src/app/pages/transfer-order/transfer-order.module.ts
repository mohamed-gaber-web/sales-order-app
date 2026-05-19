import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { TransferOrderRoutingModule } from './transfer-order-routing.module';
import { DesignSystemModule } from '../../shared/design-system/design-system.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    TransferOrderRoutingModule,
    DesignSystemModule
  ]
})
export class TransferOrderModule {}

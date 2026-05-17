import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { SalesShipmentRoutingModule } from './sales-shipment-routing.module';

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, SalesShipmentRoutingModule]
})
export class SalesShipmentModule {}

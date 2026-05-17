import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { SalesShipmentShipPage } from './sales-shipment-ship.page';

const routes: Routes = [{ path: '', component: SalesShipmentShipPage }];

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [SalesShipmentShipPage]
})
export class SalesShipmentShipModule {}

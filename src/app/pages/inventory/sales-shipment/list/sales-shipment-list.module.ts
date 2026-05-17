import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { SalesShipmentListPage } from './sales-shipment-list.page';

const routes: Routes = [{ path: '', component: SalesShipmentListPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [SalesShipmentListPage]
})
export class SalesShipmentListModule {}

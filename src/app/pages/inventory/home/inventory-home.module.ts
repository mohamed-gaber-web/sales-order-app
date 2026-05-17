import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { InventoryHomePage } from './inventory-home.page';
import { ScannerModalModule } from '../scanner/scanner-modal.module';

const routes: Routes = [{ path: '', component: InventoryHomePage }];

@NgModule({
  imports: [CommonModule, IonicModule, RouterModule.forChild(routes), ScannerModalModule],
  declarations: [InventoryHomePage]
})
export class InventoryHomeModule {}

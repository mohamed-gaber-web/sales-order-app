import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { SalesOrderScanPage } from './sales-order-scan.page';
import { ScannerModalModule } from '../../inventory/scanner/scanner-modal.module';

const routes: Routes = [
  { path: '', component: SalesOrderScanPage }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    ScannerModalModule,
  ],
  declarations: [SalesOrderScanPage]
})
export class SalesOrderScanModule {}

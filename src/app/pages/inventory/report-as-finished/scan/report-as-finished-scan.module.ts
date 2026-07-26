import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { ReportAsFinishedScanPage } from './report-as-finished-scan.page';
import { DesignSystemModule } from '../../../../shared/design-system/design-system.module';
import { ScannerModalModule } from '../../scanner/scanner-modal.module';
import { FinishedGoodsLabelModalModule } from '../label-preview/finished-goods-label-modal.module';

const routes: Routes = [
  {
    path: '',
    component: ReportAsFinishedScanPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    DesignSystemModule,
    ScannerModalModule,
    FinishedGoodsLabelModalModule
  ],
  declarations: [ReportAsFinishedScanPage]
})
export class ReportAsFinishedScanModule {}

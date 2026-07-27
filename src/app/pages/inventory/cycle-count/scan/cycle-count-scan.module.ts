import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { CycleCountScanPage } from './cycle-count-scan.page';
import { DesignSystemModule } from '../../../../shared/design-system/design-system.module';
import { ScannerModalModule } from '../../scanner/scanner-modal.module';
import { CycleCountLabelModalModule } from '../label-preview/cycle-count-label-modal.module';

const routes: Routes = [
  {
    path: '',
    component: CycleCountScanPage
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
    CycleCountLabelModalModule
  ],
  declarations: [CycleCountScanPage]
})
export class CycleCountScanModule {}

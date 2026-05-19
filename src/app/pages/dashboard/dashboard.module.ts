import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { DashboardPage } from './dashboard.page';
import { ScannerModalModule } from '../inventory/scanner/scanner-modal.module';
import { DesignSystemModule } from '../../shared/design-system/design-system.module';

const routes: Routes = [
  { path: '', component: DashboardPage }
];

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    RouterModule.forChild(routes),
    ScannerModalModule,
    DesignSystemModule,
  ],
  declarations: [DashboardPage]
})
export class DashboardModule {}

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { TransferOrderCreatePage } from './transfer-order-create.page';
import { DesignSystemModule } from '../../../shared/design-system/design-system.module';
import { ScannerModalModule } from '../../inventory/scanner/scanner-modal.module';

const routes: Routes = [
  {
    path: '',
    component: TransferOrderCreatePage,
  },
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    DesignSystemModule,
    ScannerModalModule,
  ],
  declarations: [TransferOrderCreatePage],
})
export class TransferOrderCreateModule {}

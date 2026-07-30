import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { VanSalesLabelModalComponent } from './van-sales-label-modal.component';

@NgModule({
  imports: [CommonModule, IonicModule],
  declarations: [VanSalesLabelModalComponent],
  exports: [VanSalesLabelModalComponent],
})
export class VanSalesLabelModalModule {}

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FinishedGoodsLabelModalComponent } from './finished-goods-label-modal.component';

@NgModule({
  imports: [CommonModule, IonicModule],
  declarations: [FinishedGoodsLabelModalComponent],
  exports: [FinishedGoodsLabelModalComponent],
})
export class FinishedGoodsLabelModalModule {}

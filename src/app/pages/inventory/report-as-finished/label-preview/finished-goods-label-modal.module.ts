import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FinishedGoodsLabelModalComponent } from './finished-goods-label-modal.component';
import { TranslatePipe } from '@ngx-translate/core';

@NgModule({
  imports: [CommonModule, IonicModule, TranslatePipe],
  declarations: [FinishedGoodsLabelModalComponent],
  exports: [FinishedGoodsLabelModalComponent],
})
export class FinishedGoodsLabelModalModule {}

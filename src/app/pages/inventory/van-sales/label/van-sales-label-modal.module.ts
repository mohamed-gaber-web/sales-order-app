import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { VanSalesLabelModalComponent } from './van-sales-label-modal.component';
import { TranslatePipe } from '@ngx-translate/core';

@NgModule({
  imports: [CommonModule, IonicModule, TranslatePipe],
  declarations: [VanSalesLabelModalComponent],
  exports: [VanSalesLabelModalComponent],
})
export class VanSalesLabelModalModule {}

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { CycleCountLabelModalComponent } from './cycle-count-label-modal.component';
import { TranslatePipe } from '@ngx-translate/core';

@NgModule({
  imports: [CommonModule, IonicModule, TranslatePipe],
  declarations: [CycleCountLabelModalComponent],
  exports: [CycleCountLabelModalComponent],
})
export class CycleCountLabelModalModule {}

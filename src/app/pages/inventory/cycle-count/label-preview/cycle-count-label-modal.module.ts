import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { CycleCountLabelModalComponent } from './cycle-count-label-modal.component';

@NgModule({
  imports: [CommonModule, IonicModule],
  declarations: [CycleCountLabelModalComponent],
  exports: [CycleCountLabelModalComponent],
})
export class CycleCountLabelModalModule {}

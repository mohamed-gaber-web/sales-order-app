import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { LabelPreviewModalComponent } from './label-preview-modal.component';

@NgModule({
  imports: [CommonModule, IonicModule],
  declarations: [LabelPreviewModalComponent],
  exports: [LabelPreviewModalComponent],
})
export class LabelPreviewModalModule {}

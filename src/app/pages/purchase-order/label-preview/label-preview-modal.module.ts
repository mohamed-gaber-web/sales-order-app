import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { LabelPreviewModalComponent } from './label-preview-modal.component';
import { TranslatePipe } from '@ngx-translate/core';

@NgModule({
  imports: [CommonModule, IonicModule, TranslatePipe],
  declarations: [LabelPreviewModalComponent],
  exports: [LabelPreviewModalComponent],
})
export class LabelPreviewModalModule {}

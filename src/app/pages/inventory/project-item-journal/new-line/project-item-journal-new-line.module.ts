import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { DesignSystemModule } from '../../../../shared/design-system/design-system.module';
import { ProjectItemJournalNewLinePage } from './project-item-journal-new-line.page';
import { ProjectPickerModalComponent } from './project-picker-modal.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DesignSystemModule,
    RouterModule.forChild([{ path: '', component: ProjectItemJournalNewLinePage }]),
  ],
  declarations: [ProjectItemJournalNewLinePage, ProjectPickerModalComponent],
})
export class ProjectItemJournalNewLineModule {}

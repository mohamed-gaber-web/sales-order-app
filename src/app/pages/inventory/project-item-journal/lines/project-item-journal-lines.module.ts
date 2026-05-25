import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { DesignSystemModule } from '../../../../shared/design-system/design-system.module';
import { ProjectItemJournalLinesPage } from './project-item-journal-lines.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DesignSystemModule,
    RouterModule.forChild([{ path: '', component: ProjectItemJournalLinesPage }]),
  ],
  declarations: [ProjectItemJournalLinesPage],
})
export class ProjectItemJournalLinesModule {}

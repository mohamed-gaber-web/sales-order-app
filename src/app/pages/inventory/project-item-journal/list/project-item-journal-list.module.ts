import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { DesignSystemModule } from '../../../../shared/design-system/design-system.module';
import { ProjectItemJournalListPage } from './project-item-journal-list.page';
import { NewJournalModalComponent } from './new-journal-modal.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DesignSystemModule,
    RouterModule.forChild([{ path: '', component: ProjectItemJournalListPage }]),
  ],
  declarations: [ProjectItemJournalListPage, NewJournalModalComponent],
})
export class ProjectItemJournalListModule {}

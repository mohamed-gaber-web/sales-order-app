import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { ProjectIssuanceDetailPage } from './project-issuance-detail.page';

const routes: Routes = [{ path: '', component: ProjectIssuanceDetailPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [ProjectIssuanceDetailPage]
})
export class ProjectIssuanceDetailModule {}

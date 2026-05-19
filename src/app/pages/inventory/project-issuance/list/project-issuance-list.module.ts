import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { ProjectIssuanceListPage } from './project-issuance-list.page';

const routes: Routes = [{ path: '', component: ProjectIssuanceListPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [ProjectIssuanceListPage]
})
export class ProjectIssuanceListModule {}

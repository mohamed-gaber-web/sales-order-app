import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { ProjectIssuanceAdhocPage } from './project-issuance-adhoc.page';

const routes: Routes = [{ path: '', component: ProjectIssuanceAdhocPage }];

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [ProjectIssuanceAdhocPage]
})
export class ProjectIssuanceAdhocModule {}

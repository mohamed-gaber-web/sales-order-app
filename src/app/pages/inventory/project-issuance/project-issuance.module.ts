import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ProjectIssuanceRoutingModule } from './project-issuance-routing.module';
import { DesignSystemModule } from '../../../shared/design-system/design-system.module';

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, ProjectIssuanceRoutingModule, DesignSystemModule]
})
export class ProjectIssuanceModule {}

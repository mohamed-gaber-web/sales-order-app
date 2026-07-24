import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { DesignSystemModule } from '../../../../shared/design-system/design-system.module';
import { QualityDecisionPage } from './quality-decision.page';

const routes: Routes = [{ path: '', component: QualityDecisionPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes), DesignSystemModule],
  declarations: [QualityDecisionPage]
})
export class QualityDecisionModule {}

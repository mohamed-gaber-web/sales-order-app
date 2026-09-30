import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { DesignSystemModule } from '../../../../shared/design-system/design-system.module';
import { VanSurveyEditorPage } from './van-survey-editor.page';
import { VanSurveyListPage } from './van-survey-list.page';

const routes: Routes = [
  { path: '', component: VanSurveyListPage },
  { path: ':id', component: VanSurveyEditorPage },
];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes), DesignSystemModule],
  declarations: [VanSurveyListPage, VanSurveyEditorPage],
})
export class VanSurveyBuilderModule {}

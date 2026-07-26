import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { CycleCountStartPage } from './cycle-count-start.page';
import { DesignSystemModule } from '../../../../shared/design-system/design-system.module';

const routes: Routes = [
  {
    path: '',
    component: CycleCountStartPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    DesignSystemModule
  ],
  declarations: [CycleCountStartPage]
})
export class CycleCountStartModule {}

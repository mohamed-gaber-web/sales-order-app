import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { VanVisitPage } from './van-visit.page';
import { DesignSystemModule } from '../../../../shared/design-system/design-system.module';

const routes: Routes = [{ path: '', component: VanVisitPage }];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    DesignSystemModule,
  ],
  declarations: [VanVisitPage],
})
export class VanVisitModule {}

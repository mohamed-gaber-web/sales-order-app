import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { VanJourneyPage } from './van-journey.page';
import { DesignSystemModule } from '../../../../shared/design-system/design-system.module';

const routes: Routes = [{ path: '', component: VanJourneyPage }];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    DesignSystemModule,
  ],
  declarations: [VanJourneyPage],
})
export class VanJourneyModule {}

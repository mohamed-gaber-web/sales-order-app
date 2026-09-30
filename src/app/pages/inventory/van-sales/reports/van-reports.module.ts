import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { DesignSystemModule } from '../../../../shared/design-system/design-system.module';
import { VanReportsPage } from './van-reports.page';
import { ChartsModule } from '../../../../shared/charts';

const routes: Routes = [{ path: '', component: VanReportsPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes), DesignSystemModule, ChartsModule],
  declarations: [VanReportsPage],
})
export class VanReportsModule {}

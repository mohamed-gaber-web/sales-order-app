import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { DesignSystemModule } from '../../../../shared/design-system/design-system.module';
import { QualityListPage } from './quality-list.page';

const routes: Routes = [{ path: '', component: QualityListPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes), DesignSystemModule],
  declarations: [QualityListPage]
})
export class QualityListModule {}

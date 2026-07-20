import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { ProductionPickingDetailPage } from './production-picking-detail.page';
import { DesignSystemModule } from '../../../../shared/design-system/design-system.module';

const routes: Routes = [{ path: '', component: ProductionPickingDetailPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes), DesignSystemModule],
  declarations: [ProductionPickingDetailPage]
})
export class ProductionPickingDetailModule {}

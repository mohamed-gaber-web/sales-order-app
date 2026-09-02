import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { SetupRequiredPage } from './setup-required.page';
import { DesignSystemModule } from '../../shared/design-system/design-system.module';

const routes: Routes = [{ path: '', component: SetupRequiredPage }];

@NgModule({
  imports: [CommonModule, IonicModule, RouterModule.forChild(routes), DesignSystemModule],
  declarations: [SetupRequiredPage]
})
export class SetupRequiredModule {}

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { ResetPasswordPage } from './reset-password.page';
import { DesignSystemModule } from '../../../shared/design-system/design-system.module';

const routes: Routes = [{ path: '', component: ResetPasswordPage }];

@NgModule({
  imports: [CommonModule, ReactiveFormsModule, IonicModule, RouterModule.forChild(routes), DesignSystemModule],
  declarations: [ResetPasswordPage]
})
export class ResetPasswordModule {}

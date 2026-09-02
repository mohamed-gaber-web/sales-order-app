import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { ForgotPasswordPage } from './forgot-password.page';
import { DesignSystemModule } from '../../../shared/design-system/design-system.module';

const routes: Routes = [{ path: '', component: ForgotPasswordPage }];

@NgModule({
  imports: [CommonModule, ReactiveFormsModule, IonicModule, RouterModule.forChild(routes), DesignSystemModule],
  declarations: [ForgotPasswordPage]
})
export class ForgotPasswordModule {}

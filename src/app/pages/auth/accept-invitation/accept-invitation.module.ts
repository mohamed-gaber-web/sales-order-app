import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { AcceptInvitationPage } from './accept-invitation.page';
import { DesignSystemModule } from '../../../shared/design-system/design-system.module';

const routes: Routes = [{ path: '', component: AcceptInvitationPage }];

@NgModule({
  imports: [CommonModule, ReactiveFormsModule, IonicModule, RouterModule.forChild(routes), DesignSystemModule],
  declarations: [AcceptInvitationPage]
})
export class AcceptInvitationModule {}

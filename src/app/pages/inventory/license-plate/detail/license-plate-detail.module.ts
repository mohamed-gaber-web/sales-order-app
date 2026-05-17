import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { LicensePlateDetailPage } from './license-plate-detail.page';

const routes: Routes = [{ path: '', component: LicensePlateDetailPage }];

@NgModule({
  imports: [CommonModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [LicensePlateDetailPage],
})
export class LicensePlateDetailModule {}

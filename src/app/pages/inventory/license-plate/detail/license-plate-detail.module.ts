import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { LicensePlateDetailPage } from './license-plate-detail.page';
import { TranslatePipe } from '@ngx-translate/core';

const routes: Routes = [{ path: '', component: LicensePlateDetailPage }];

@NgModule({
  imports: [CommonModule, IonicModule, RouterModule.forChild(routes), TranslatePipe],
  declarations: [LicensePlateDetailPage],
})
export class LicensePlateDetailModule {}

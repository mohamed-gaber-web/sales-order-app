import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { LicensePlateListPage } from './license-plate-list.page';

const routes: Routes = [{ path: '', component: LicensePlateListPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [LicensePlateListPage],
})
export class LicensePlateListModule {}

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { PickPutListPage } from './pick-put-list.page';

const routes: Routes = [{ path: '', component: PickPutListPage }];

@NgModule({
  imports: [CommonModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [PickPutListPage],
})
export class PickPutListModule {}

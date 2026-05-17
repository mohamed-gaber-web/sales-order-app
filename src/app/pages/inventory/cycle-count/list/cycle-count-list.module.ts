import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { CycleCountListPage } from './cycle-count-list.page';

const routes: Routes = [{ path: '', component: CycleCountListPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [CycleCountListPage]
})
export class CycleCountListModule {}

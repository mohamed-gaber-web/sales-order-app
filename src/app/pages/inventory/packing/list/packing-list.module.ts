import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { PackingListPage } from './packing-list.page';
import { TranslatePipe } from '@ngx-translate/core';

const routes: Routes = [{ path: '', component: PackingListPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes), TranslatePipe],
  declarations: [PackingListPage],
})
export class PackingListModule {}

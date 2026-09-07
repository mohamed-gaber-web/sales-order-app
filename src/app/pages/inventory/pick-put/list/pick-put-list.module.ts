import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { PickPutListPage } from './pick-put-list.page';
import { TranslatePipe } from '@ngx-translate/core';

const routes: Routes = [{ path: '', component: PickPutListPage }];

@NgModule({
  imports: [CommonModule, IonicModule, RouterModule.forChild(routes), TranslatePipe],
  declarations: [PickPutListPage],
})
export class PickPutListModule {}

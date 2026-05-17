import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { PickPutWorkPage } from './pick-put-work.page';

const routes: Routes = [{ path: '', component: PickPutWorkPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [PickPutWorkPage],
})
export class PickPutWorkModule {}

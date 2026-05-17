import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { CycleCountFormPage } from './cycle-count-form.page';

const routes: Routes = [{ path: '', component: CycleCountFormPage }];

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [CycleCountFormPage]
})
export class CycleCountFormModule {}

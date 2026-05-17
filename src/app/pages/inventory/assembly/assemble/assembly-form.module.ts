import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { AssemblyFormPage } from './assembly-form.page';

const routes: Routes = [{ path: '', component: AssemblyFormPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [AssemblyFormPage]
})
export class AssemblyFormModule {}

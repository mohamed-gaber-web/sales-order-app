import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { AssemblyFormPage } from './assembly-form.page';
import { TranslatePipe } from '@ngx-translate/core';

const routes: Routes = [{ path: '', component: AssemblyFormPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes), TranslatePipe],
  declarations: [AssemblyFormPage]
})
export class AssemblyFormModule {}

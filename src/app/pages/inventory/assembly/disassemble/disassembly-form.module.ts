import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { DisassemblyFormPage } from './disassembly-form.page';

const routes: Routes = [{ path: '', component: DisassemblyFormPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [DisassemblyFormPage]
})
export class DisassemblyFormModule {}

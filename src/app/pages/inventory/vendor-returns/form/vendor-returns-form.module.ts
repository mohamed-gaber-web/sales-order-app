import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { VendorReturnsFormPage } from './vendor-returns-form.page';

const routes: Routes = [{ path: '', component: VendorReturnsFormPage }];

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [VendorReturnsFormPage]
})
export class VendorReturnsFormModule {}

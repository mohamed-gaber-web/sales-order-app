import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { SalesOrderLineFormPage } from './sales-order-line-form.page';

const routes: Routes = [
  {
    path: '',
    component: SalesOrderLineFormPage,
  },
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    RouterModule.forChild(routes),
  ],
  declarations: [SalesOrderLineFormPage],
})
export class SalesOrderLineFormModule {}

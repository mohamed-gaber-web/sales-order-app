import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { SalesOrderLineFormPage } from './sales-order-line-form.page';
import { TranslatePipe } from '@ngx-translate/core';

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
    RouterModule.forChild(routes), TranslatePipe],
  declarations: [SalesOrderLineFormPage],
})
export class SalesOrderLineFormModule {}

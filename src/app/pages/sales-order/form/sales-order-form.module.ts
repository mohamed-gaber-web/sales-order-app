import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { SalesOrderFormPage } from './sales-order-form.page';
import { TranslatePipe } from '@ngx-translate/core';

const routes: Routes = [
  {
    path: '',
    component: SalesOrderFormPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    RouterModule.forChild(routes), TranslatePipe],
  declarations: [SalesOrderFormPage]
})
export class SalesOrderFormModule {}

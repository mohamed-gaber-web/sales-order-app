import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { SalesOrderLineDetailPage } from './sales-order-line-detail.page';

const routes: Routes = [
  {
    path: '',
    component: SalesOrderLineDetailPage,
  },
];

@NgModule({
  imports: [CommonModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [SalesOrderLineDetailPage],
})
export class SalesOrderLineDetailModule {}

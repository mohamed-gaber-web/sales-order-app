import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { CustomerReturnsReceivePage } from './customer-returns-receive.page';

const routes: Routes = [{ path: '', component: CustomerReturnsReceivePage }];

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [CustomerReturnsReceivePage]
})
export class CustomerReturnsReceiveModule {}

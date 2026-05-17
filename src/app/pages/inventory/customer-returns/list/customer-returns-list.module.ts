import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { CustomerReturnsListPage } from './customer-returns-list.page';

const routes: Routes = [{ path: '', component: CustomerReturnsListPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [CustomerReturnsListPage]
})
export class CustomerReturnsListModule {}

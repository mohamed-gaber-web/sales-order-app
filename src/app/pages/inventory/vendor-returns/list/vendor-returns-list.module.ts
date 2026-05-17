import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { VendorReturnsListPage } from './vendor-returns-list.page';

const routes: Routes = [{ path: '', component: VendorReturnsListPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [VendorReturnsListPage]
})
export class VendorReturnsListModule {}

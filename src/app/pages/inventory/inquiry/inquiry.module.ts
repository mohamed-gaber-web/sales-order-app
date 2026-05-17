import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { InquiryPage } from './inquiry.page';
import { InquiryItemsPage } from './inquiry-items.page';

const routes: Routes = [
  { path: '', component: InquiryPage },
  { path: 'items/:warehouseId', component: InquiryItemsPage },
];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [InquiryPage, InquiryItemsPage],
})
export class InquiryModule {}

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { ProductionIssueFormPage } from './production-issue-form.page';

const routes: Routes = [{ path: '', component: ProductionIssueFormPage }];

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [ProductionIssueFormPage]
})
export class ProductionIssueFormModule {}

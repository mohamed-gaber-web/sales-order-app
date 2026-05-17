import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { ProductionIssueListPage } from './production-issue-list.page';

const routes: Routes = [{ path: '', component: ProductionIssueListPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [ProductionIssueListPage]
})
export class ProductionIssueListModule {}

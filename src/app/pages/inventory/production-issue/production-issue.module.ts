import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ProductionIssueRoutingModule } from './production-issue-routing.module';

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, ProductionIssueRoutingModule]
})
export class ProductionIssueModule {}

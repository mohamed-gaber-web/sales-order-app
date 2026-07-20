import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ProductionPickingRoutingModule } from './production-picking-routing.module';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, ProductionPickingRoutingModule]
})
export class ProductionPickingModule {}

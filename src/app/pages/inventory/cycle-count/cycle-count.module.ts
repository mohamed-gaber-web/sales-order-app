import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { CycleCountRoutingModule } from './cycle-count-routing.module';

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, CycleCountRoutingModule]
})
export class CycleCountModule {}

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AssemblyRoutingModule } from './assembly-routing.module';

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, AssemblyRoutingModule]
})
export class AssemblyModule {}

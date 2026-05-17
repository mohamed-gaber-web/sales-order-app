import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { VendorReturnsRoutingModule } from './vendor-returns-routing.module';

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, VendorReturnsRoutingModule]
})
export class VendorReturnsModule {}

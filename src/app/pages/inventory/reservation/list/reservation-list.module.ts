import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { ReservationListPage } from './reservation-list.page';

const routes: Routes = [{ path: '', component: ReservationListPage }];

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [ReservationListPage],
})
export class ReservationListModule {}

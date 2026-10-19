import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { SalesLineListPage } from './list/sales-line-list.page';
import { SalesLineActionPage } from './action/sales-line-action.page';

// One module serves all five sales line actions; the parent route's
// `data.action` decides which one this instance is.
const routes: Routes = [
  { path: '', component: SalesLineListPage },
  { path: ':salesId', component: SalesLineActionPage },
];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes), TranslatePipe],
  declarations: [SalesLineListPage, SalesLineActionPage],
})
export class SalesLineActionModule {}

import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { LocationMgmtPage } from './location-mgmt.page';

const routes: Routes = [
  { path: '', component: LocationMgmtPage },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class LocationMgmtRoutingModule {}

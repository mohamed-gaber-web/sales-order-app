import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () =>
      import('./list/license-plate-list.module').then(m => m.LicensePlateListModule),
  },
  {
    path: 'detail/:lpId',
    loadChildren: () =>
      import('./detail/license-plate-detail.module').then(m => m.LicensePlateDetailModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class LicensePlateRoutingModule {}

import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () =>
      import('./list/pick-put-list.module').then(m => m.PickPutListModule),
  },
  {
    path: 'work/:workId',
    loadChildren: () =>
      import('./work/pick-put-work.module').then(m => m.PickPutWorkModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PickPutRoutingModule {}

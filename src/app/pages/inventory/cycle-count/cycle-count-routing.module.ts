import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./list/cycle-count-list.module').then(m => m.CycleCountListModule)
  },
  {
    path: 'detail/:journalNumber',
    loadChildren: () => import('./form/cycle-count-form.module').then(m => m.CycleCountFormModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CycleCountRoutingModule {}

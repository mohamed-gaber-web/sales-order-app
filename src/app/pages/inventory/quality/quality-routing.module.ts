import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./list/quality-list.module').then(m => m.QualityListModule)
  },
  {
    path: 'tests/:qoId',
    loadChildren: () => import('./tests/quality-tests.module').then(m => m.QualityTestsModule)
  },
  {
    path: 'decision/:qoId',
    loadChildren: () => import('./decision/quality-decision.module').then(m => m.QualityDecisionModule)
  },
  {
    path: 'quarantine',
    loadChildren: () => import('./quarantine/quality-quarantine.module').then(m => m.QualityQuarantineModule)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class QualityRoutingModule {}

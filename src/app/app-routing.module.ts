import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'sales-order/list',
    pathMatch: 'full'
  },
  {
    path: 'sales-order',
    loadChildren: () => import('./pages/sales-order/sales-order.module').then(m => m.SalesOrderModule)
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}

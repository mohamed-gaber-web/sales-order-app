import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    loadChildren: () => import('./pages/dashboard/dashboard.module').then(m => m.DashboardModule)
  },
  {
    path: 'sales-order',
    loadChildren: () => import('./pages/sales-order/sales-order.module').then(m => m.SalesOrderModule)
  },
  {
    path: 'sales-order-line',
    loadChildren: () => import('./pages/sales-order-line/sales-order-line.module').then(m => m.SalesOrderLineModule)
  },
  {
    path: 'purchase-order',
    loadChildren: () => import('./pages/purchase-order/purchase-order.module').then(m => m.PurchaseOrderModule)
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}

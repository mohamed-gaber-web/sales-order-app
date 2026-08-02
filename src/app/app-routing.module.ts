import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'auth',
    loadChildren: () => import('./pages/auth/auth.module').then(m => m.AuthModule)
  },
  {
    path: 'dashboard',
    loadChildren: () => import('./pages/dashboard/dashboard.module').then(m => m.DashboardModule),
    canActivate: [AuthGuard]
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
  },
  {
    path: 'purchase-order-register',
    loadChildren: () => import('./pages/purchase-order-register/purchase-order-register.module').then(m => m.PurchaseOrderRegisterModule)
  },
  {
    path: 'transfer-order',
    loadChildren: () => import('./pages/transfer-order/transfer-order.module').then(m => m.TransferOrderModule)
  },
  {
    path: 'inventory',
    loadChildren: () => import('./pages/inventory/inventory.module').then(m => m.InventoryModule)
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}

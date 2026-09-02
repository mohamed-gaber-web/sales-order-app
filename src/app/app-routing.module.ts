import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { authGuard } from './core/auth';
import { erpConfiguredGuard, setupRequiredGuard } from './core/tenant';

/**
 * Everything except `/auth` sits behind `authGuard`.
 *
 * Guarding only the dashboard would leave every other feature reachable by
 * typing its URL — and while the API refuses an unauthenticated caller anyway,
 * what the user would see is a screen whose data is mysteriously empty rather
 * than a sign-in prompt.
 */
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
    canActivate: [authGuard, erpConfiguredGuard]
  },
  {
    path: 'sales-order',
    loadChildren: () => import('./pages/sales-order/sales-order.module').then(m => m.SalesOrderModule),
    canActivate: [authGuard, erpConfiguredGuard]
  },
  {
    path: 'sales-order-line',
    loadChildren: () => import('./pages/sales-order-line/sales-order-line.module').then(m => m.SalesOrderLineModule),
    canActivate: [authGuard, erpConfiguredGuard]
  },
  {
    path: 'purchase-order',
    loadChildren: () => import('./pages/purchase-order/purchase-order.module').then(m => m.PurchaseOrderModule),
    canActivate: [authGuard, erpConfiguredGuard]
  },
  {
    path: 'purchase-order-register',
    loadChildren: () => import('./pages/purchase-order-register/purchase-order-register.module').then(m => m.PurchaseOrderRegisterModule),
    canActivate: [authGuard, erpConfiguredGuard]
  },
  {
    path: 'transfer-order',
    loadChildren: () => import('./pages/transfer-order/transfer-order.module').then(m => m.TransferOrderModule),
    canActivate: [authGuard, erpConfiguredGuard]
  },
  {
    path: 'inventory',
    loadChildren: () => import('./pages/inventory/inventory.module').then(m => m.InventoryModule),
    canActivate: [authGuard, erpConfiguredGuard]
  },
  {
    // Reachable only while the workspace cannot use the ERP. `authGuard` still
    // applies: this explains a configuration problem, not a sign-in one.
    path: 'setup-required',
    loadChildren: () => import('./pages/setup-required/setup-required.module').then(m => m.SetupRequiredModule),
    canActivate: [authGuard, setupRequiredGuard]
  },
  // An unknown URL previously matched nothing at all, leaving a blank shell.
  // Sending it to the dashboard puts a signed-out visitor through `authGuard`.
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}

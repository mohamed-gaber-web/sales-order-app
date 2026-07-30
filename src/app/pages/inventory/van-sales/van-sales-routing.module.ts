import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./catalog/van-sales-catalog.module').then(m => m.VanSalesCatalogModule)
  },
  {
    path: 'cart',
    loadChildren: () => import('./cart/van-sales-cart.module').then(m => m.VanSalesCartModule)
  },
  {
    path: 'checkout',
    loadChildren: () => import('./checkout/van-sales-checkout.module').then(m => m.VanSalesCheckoutModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class VanSalesRoutingModule {}

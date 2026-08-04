import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

// The van sales cycle: the driver works a planned route of customer stops —
// journey → visit → {sell (catalog → cart → checkout), collect, return} — plus
// new-customer requests and an end-of-day sync & close. See the IKK Foods
// "Van Sales — D365 Direct API" spec in /Van Sales.
const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./journey/van-journey.module').then(m => m.VanJourneyModule)
  },
  {
    path: 'visit/:id',
    loadChildren: () => import('./visit/van-visit.module').then(m => m.VanVisitModule)
  },
  {
    path: 'catalog',
    loadChildren: () => import('./catalog/van-sales-catalog.module').then(m => m.VanSalesCatalogModule)
  },
  {
    path: 'cart',
    loadChildren: () => import('./cart/van-sales-cart.module').then(m => m.VanSalesCartModule)
  },
  {
    path: 'checkout',
    loadChildren: () => import('./checkout/van-sales-checkout.module').then(m => m.VanSalesCheckoutModule)
  },
  {
    path: 'collect/:id',
    loadChildren: () => import('./collect/van-collect.module').then(m => m.VanCollectModule)
  },
  {
    path: 'return/:id',
    loadChildren: () => import('./return/van-return.module').then(m => m.VanReturnModule)
  },
  {
    path: 'new-customer',
    loadChildren: () => import('./new-customer/van-new-customer.module').then(m => m.VanNewCustomerModule)
  },
  {
    path: 'day-close',
    loadChildren: () => import('./day-close/van-day-close.module').then(m => m.VanDayCloseModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class VanSalesRoutingModule {}

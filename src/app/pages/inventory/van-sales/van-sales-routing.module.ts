import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { vanDataGuard, vanRoleGuard } from '../../../core/van-sales/van-sales.guards';

// The van sales cycle (VAN_SALES_UPDATE_SPEC.md §7): the rep works a planned
// route of customer stops — journey → visit → {sell / take order, deliver,
// collect, return, survey} → receipt — plus the screens around the round:
// pre-sales orders, deliveries, collections, van stock, new-customer requests,
// sync & day close, and the supervisor's approvals, cheques and e-documents.
//
// Every screen sits under `vanDataGuard`, which loads master data first, and
// most under a role guard (§3): the guard names the actions that justify
// being on the screen at all.
const routes: Routes = [
  {
    path: '',
    canActivate: [vanDataGuard],
    children: [
      {
        path: '',
        loadChildren: () => import('./journey/van-journey.module').then(m => m.VanJourneyModule)
      },
      {
        path: 'visit/:id',
        loadChildren: () => import('./visit/van-visit.module').then(m => m.VanVisitModule)
      },
      {
        path: 'sell/:id',
        canActivate: [vanRoleGuard('SELL', 'TAKE_ORDER')],
        loadChildren: () => import('./sell/van-sell.module').then(m => m.VanSellModule)
      },
      {
        path: 'receipt/:docId',
        loadChildren: () => import('./receipt/van-receipt.module').then(m => m.VanReceiptModule)
      },
      {
        path: 'catalog',
        canActivate: [vanRoleGuard('SELL')],
        loadChildren: () => import('./catalog/van-sales-catalog.module').then(m => m.VanSalesCatalogModule)
      },
      {
        path: 'cart',
        canActivate: [vanRoleGuard('SELL')],
        loadChildren: () => import('./cart/van-sales-cart.module').then(m => m.VanSalesCartModule)
      },
      {
        path: 'checkout',
        canActivate: [vanRoleGuard('SELL')],
        loadChildren: () => import('./checkout/van-sales-checkout.module').then(m => m.VanSalesCheckoutModule)
      },
      {
        path: 'collect/:id',
        canActivate: [vanRoleGuard('COLLECT')],
        loadChildren: () => import('./collect/van-collect.module').then(m => m.VanCollectModule)
      },
      {
        path: 'collections',
        canActivate: [vanRoleGuard('COLLECT')],
        loadChildren: () => import('./collections/van-collections.module').then(m => m.VanCollectionsModule)
      },
      {
        path: 'return/:id',
        canActivate: [vanRoleGuard('RETURN')],
        loadChildren: () => import('./return/van-return.module').then(m => m.VanReturnModule)
      },
      {
        path: 'survey/:id',
        canActivate: [vanRoleGuard('SURVEY')],
        loadChildren: () => import('./survey/van-survey.module').then(m => m.VanSurveyModule)
      },
      {
        path: 'orders',
        canActivate: [vanRoleGuard('TAKE_ORDER')],
        loadChildren: () => import('./orders/van-orders.module').then(m => m.VanOrdersModule)
      },
      {
        path: 'deliveries',
        canActivate: [vanRoleGuard('DELIVER')],
        loadChildren: () => import('./deliveries/van-deliveries.module').then(m => m.VanDeliveriesModule)
      },
      {
        path: 'deliver/:salesId',
        canActivate: [vanRoleGuard('DELIVER')],
        loadChildren: () => import('./deliver/van-deliver.module').then(m => m.VanDeliverModule)
      },
      {
        path: 'stock',
        canActivate: [vanRoleGuard('VAN_STOCK')],
        loadChildren: () => import('./stock/van-stock.module').then(m => m.VanStockModule)
      },
      {
        path: 'new-customer',
        canActivate: [vanRoleGuard('NEW_CUSTOMER')],
        loadChildren: () => import('./new-customer/van-new-customer.module').then(m => m.VanNewCustomerModule)
      },
      {
        path: 'day-close',
        canActivate: [vanRoleGuard('DAY_CLOSE')],
        loadChildren: () => import('./day-close/van-day-close.module').then(m => m.VanDayCloseModule)
      },
      {
        path: 'supervisor',
        canActivate: [vanRoleGuard('APPROVE')],
        loadChildren: () => import('./supervisor/van-supervisor.module').then(m => m.VanSupervisorModule)
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class VanSalesRoutingModule {}

import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./home/inventory-home.module').then(m => m.InventoryHomeModule)
  },
  {
    path: 'on-hand',
    loadChildren: () => import('./on-hand/on-hand.module').then(m => m.OnHandModule)
  },
  {
    path: 'customer-returns',
    loadChildren: () => import('./customer-returns/customer-returns.module').then(m => m.CustomerReturnsModule)
  },
  {
    path: 'sales-shipment',
    loadChildren: () => import('./sales-shipment/sales-shipment.module').then(m => m.SalesShipmentModule)
  },
  {
    path: 'transfer-ship',
    loadChildren: () => import('./transfer-ship/transfer-ship.module').then(m => m.TransferShipModule)
  },
  {
    path: 'transfer-receive',
    loadChildren: () => import('./transfer-receive/transfer-receive.module').then(m => m.TransferReceiveModule)
  },
  {
    path: 'production-issue',
    loadChildren: () => import('./production-issue/production-issue.module').then(m => m.ProductionIssueModule)
  },
  {
    path: 'cycle-count',
    loadChildren: () => import('./cycle-count/cycle-count.module').then(m => m.CycleCountModule)
  },
  {
    path: 'assembly',
    loadChildren: () => import('./assembly/assembly.module').then(m => m.AssemblyModule)
  },
  {
    path: 'license-plate',
    loadChildren: () => import('./license-plate/license-plate.module').then(m => m.LicensePlateModule)
  },
  {
    path: 'pick-put',
    loadChildren: () => import('./pick-put/pick-put.module').then(m => m.PickPutModule)
  },
  {
    path: 'reservation',
    loadChildren: () => import('./reservation/reservation.module').then(m => m.ReservationModule)
  },
  {
    path: 'packing',
    loadChildren: () => import('./packing/packing.module').then(m => m.PackingModule)
  },
  {
    path: 'vendor-returns',
    loadChildren: () => import('./vendor-returns/vendor-returns.module').then(m => m.VendorReturnsModule)
  },
  {
    path: 'location-mgmt',
    loadChildren: () => import('./location-mgmt/location-mgmt.module').then(m => m.LocationMgmtModule)
  },
  {
    path: 'inquiry',
    loadChildren: () => import('./inquiry/inquiry.module').then(m => m.InquiryModule)
  },
  {
    path: 'ai-hub',
    loadChildren: () => import('./ai-hub/ai-hub.module').then(m => m.AiHubModule)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class InventoryRoutingModule {}

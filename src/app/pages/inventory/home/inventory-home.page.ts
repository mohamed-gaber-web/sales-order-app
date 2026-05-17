import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { BarcodeScannerService } from '../../../core/services/barcode-scanner.service';
import { ScannerModalComponent } from '../scanner/scanner-modal.component';

interface InventoryTile {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  route: string;
  badge?: string;
}

@Component({
  selector: 'app-inventory-home',
  templateUrl: './inventory-home.page.html',
  styleUrls: ['./inventory-home.page.scss'],
  standalone: false,
})
export class InventoryHomePage {
  readonly tiles: InventoryTile[] = [
    {
      id: 'US-01',
      title: 'PO Receiving',
      subtitle: 'Receive purchase orders',
      icon: 'download-outline',
      color: '#2563eb',
      route: '/purchase-order/list',
    },
    {
      id: 'US-02',
      title: 'Production Issue',
      subtitle: 'Issue to production orders',
      icon: 'construct-outline',
      color: '#7c3aed',
      route: '/inventory/production-issue',
    },
    {
      id: 'US-03',
      title: 'Transfer Orders',
      subtitle: 'Ship & receive transfers',
      icon: 'swap-horizontal-outline',
      color: '#0891b2',
      route: '/transfer-order/list',
    },
    {
      id: 'US-04',
      title: 'Cycle Count',
      subtitle: 'Count & adjust inventory',
      icon: 'calculator-outline',
      color: '#059669',
      route: '/inventory/cycle-count',
    },
    {
      id: 'US-05',
      title: 'Assembly',
      subtitle: 'Assemble & disassemble kits',
      icon: 'extension-puzzle-outline',
      color: '#d97706',
      route: '/inventory/assembly',
    },
    {
      id: 'US-06',
      title: 'Sales Shipment',
      subtitle: 'Ship sales orders',
      icon: 'cube-outline',
      color: '#dc2626',
      route: '/inventory/sales-shipment',
    },
    {
      id: 'US-07',
      title: 'Customer Returns',
      subtitle: 'Process return orders',
      icon: 'return-down-back-outline',
      color: '#ea580c',
      route: '/inventory/customer-returns',
    },
    {
      id: 'US-08',
      title: 'Vendor Returns',
      subtitle: 'Return items to vendors',
      icon: 'arrow-undo-outline',
      color: '#9f1239',
      route: '/inventory/vendor-returns',
    },
    {
      id: 'US-09',
      title: 'Location Management',
      subtitle: 'Manage warehouse locations',
      icon: 'location-outline',
      color: '#0369a1',
      route: '/inventory/location-mgmt',
    },
    {
      id: 'US-10',
      title: 'License Plates',
      subtitle: 'Manage LPs',
      icon: 'barcode-outline',
      color: '#4338ca',
      route: '/inventory/license-plate',
    },
    {
      id: 'US-11',
      title: 'Reservation',
      subtitle: 'Reserve & release stock',
      icon: 'lock-closed-outline',
      color: '#0f766e',
      route: '/inventory/reservation',
    },
    {
      id: 'US-12',
      title: 'Pick & Put',
      subtitle: 'Pick and put away work',
      icon: 'hand-right-outline',
      color: '#7e22ce',
      route: '/inventory/pick-put',
    },
    {
      id: 'US-13',
      title: 'Packing',
      subtitle: 'Pack items for shipment',
      icon: 'archive-outline',
      color: '#b45309',
      route: '/inventory/packing',
    },
    {
      id: 'US-14',
      title: 'Inventory Inquiry',
      subtitle: 'Search items by warehouse',
      icon: 'search-outline',
      color: '#0284c7',
      route: '/inventory/inquiry',
    },
  ];

  constructor(
    private router: Router,
    private modalCtrl: ModalController,
    private scannerService: BarcodeScannerService,
  ) {}

  navigate(tile: InventoryTile) {
    this.router.navigateByUrl(tile.route);
  }

  async openScanner() {
    const modal = await this.modalCtrl.create({
      component: ScannerModalComponent,
      cssClass: 'scanner-modal',
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<string>();
    if (data) {
      const route = this.scannerService.resolveRoute(data);
      this.router.navigateByUrl(route, { state: { scannedValue: data } });
    }
  }
}

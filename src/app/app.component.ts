import { Component, OnInit } from '@angular/core';
import { ThemeService } from './core';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  public menuGroups = [
    {
      title: 'Inventory',
      icon: 'layers',
      expanded: false,
      items: [
        { title: 'Transfer Order', url: '/transfer-order/list', icon: 'swap-horizontal' },
        { title: 'Count Cycle',    url: '/inventory/cycle-count', icon: 'refresh-circle' },
        { title: 'Movement',       url: null, icon: 'git-branch', comingSoon: true },
      ]
    },
    {
      title: 'Purchase Order',
      icon: 'cube',
      expanded: false,
      items: [
        { title: 'Product Receipt', url: '/purchase-order/list', icon: 'download' },
        { title: 'Vendor Return',   url: '/inventory/vendor-returns', icon: 'return-up-back' },
      ]
    },
    {
      title: 'Sales Order',
      icon: 'cart',
      expanded: false,
      items: [
        { title: 'Packing Slip',    url: '/inventory/sales-shipment', icon: 'archive' },
        { title: 'Return Customer', url: null, icon: 'person-remove', comingSoon: true },
        { title: 'Return Order',    url: null, icon: 'arrow-undo', comingSoon: true },
        { title: 'Reservation',     url: '/inventory/reservation', icon: 'bookmark' },
      ]
    },
    {
      title: 'Production',
      icon: 'construct',
      expanded: false,
      items: [
        { title: 'Picking List',       url: null, icon: 'list',             comingSoon: true },
        { title: 'Report As Finished', url: null, icon: 'checkmark-circle', comingSoon: true },
      ]
    },
    {
      title: 'Wh Management',
      icon: 'business',
      expanded: false,
      items: [
        { title: 'LP',         url: '/inventory/license-plate', icon: 'barcode' },
        { title: 'Pick & Put', url: '/inventory/pick-put',      icon: 'hand-right' },
        { title: 'Packing',    url: '/inventory/packing',       icon: 'cube' },
      ]
    },
    {
      title: 'Inquiry',
      icon: 'search',
      expanded: false,
      items: [
        { title: 'On Hand List', url: '/inventory/on-hand', icon: 'stats-chart' },
      ]
    },
  ];

  toggleGroup(group: { expanded: boolean }) {
    const opening = !group.expanded;
    this.menuGroups.forEach(g => g.expanded = false);
    if (opening) group.expanded = true;
  }

  showSplash = true;
  splashFading = false;

  readonly themeMode = this.themeService.mode;
  readonly isDark = this.themeService.isDark;

  constructor(private themeService: ThemeService) {}

  ngOnInit() {
    this.themeService.initialize();
    setTimeout(() => {
      this.splashFading = true;
      setTimeout(() => { this.showSplash = false; }, 500);
    }, 1800);
  }

  get themeIcon(): string {
    const mode = this.themeMode();
    if (mode === 'dark') return 'moon';
    if (mode === 'light') return 'sunny';
    return 'contrast';
  }

  get themeLabel(): string {
    const mode = this.themeMode();
    if (mode === 'dark') return 'Dark';
    if (mode === 'light') return 'Light';
    return 'System';
  }

  toggleTheme() {
    this.themeService.toggle();
  }
}

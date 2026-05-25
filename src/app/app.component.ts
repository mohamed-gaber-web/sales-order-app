import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { filter, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { ThemeService } from './core';
import { UserAuthService } from './core/services/user-auth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  currentUrl = '';
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
        { title: 'Packing Slip',    url: '/sales-order/list', icon: 'archive' },
        { title: 'Return Customer', url: null, icon: 'person-remove', comingSoon: true },
        { title: 'Return Order',    url: null, icon: 'arrow-undo', comingSoon: true },
        { title: 'Reservation',     url: '/inventory/reservation', icon: 'bookmark' },
      ]
    },
    {
      title: 'Project',
      icon: 'folder-open',
      expanded: false,
      items: [
        // { title: 'Project', url: '/inventory/project-issuance', icon: 'git-merge' },
        { title: 'Item Requirements', url: '/inventory/project-item-requirements', icon: 'list' },
        { title: 'Item Journal', url: '/inventory/project-item-journal', icon: 'document-text' },
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
        { title: 'On Hand List',      url: '/inventory/on-hand',  icon: 'stats-chart' },
        { title: 'Inventory Inquiry', url: '/inventory/inquiry',  icon: 'search' },
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

  constructor(
    private themeService: ThemeService,
    private router: Router,
    private toastCtrl: ToastController,
    private userAuth: UserAuthService,
  ) {}

  isAuthPage(): boolean { return this.currentUrl.startsWith('/auth'); }

  logout(): void { this.userAuth.signOut(); }

  get loggedInUser() { return this.userAuth.getUser(); }

  isTab(path: string): boolean {
    return this.currentUrl.startsWith(path);
  }

  isInventoryTab(): boolean {
    return this.currentUrl.startsWith('/inventory') &&
           !this.currentUrl.startsWith('/inventory/ai-hub');
  }

  async openProfile() {
    const toast = await this.toastCtrl.create({
      message: 'Profile — Coming Soon',
      duration: 2000,
      position: 'bottom',
      color: 'dark',
    });
    await toast.present();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit() {
    this.themeService.initialize();
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntil(this.destroy$),
    ).subscribe((e) => {
      this.currentUrl = (e as NavigationEnd).urlAfterRedirects;
    });
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

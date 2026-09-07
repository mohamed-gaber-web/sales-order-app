import { Component, OnInit, OnDestroy, computed, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { filter, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService, PortalSessionStore, ThemeService, UserAuthService } from './core';

/**
 * A navigation entry.
 *
 * `titleKey` rather than a title: the menu renders in whichever language the
 * user chose, so a label baked in here could never follow. The wording lives in
 * `assets/i18n`, under `menu.*`.
 */
interface MenuItem {
  titleKey: string;
  url: string | null;
  icon: string;
  comingSoon?: boolean;
}

interface MenuGroup {
  titleKey: string;
  icon: string;
  expanded: boolean;
  items: MenuItem[];
}

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly themeService = inject(ThemeService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);
  private readonly userAuth = inject(UserAuthService);
  private readonly session = inject(PortalSessionStore);

  private destroy$ = new Subject<void>();
  currentUrl = '';
  public menuGroups: MenuGroup[] = [
    {
      titleKey: 'menu.groups.inventory',
      icon: 'layers',
      expanded: false,
      items: [
        { titleKey: 'menu.items.transferOrder', url: '/transfer-order/list', icon: 'swap-horizontal' },
        { titleKey: 'menu.items.countCycle',    url: '/inventory/cycle-count', icon: 'refresh-circle' },
        { titleKey: 'menu.items.barcodeCount',  url: '/inventory/cycle-count/count-by-barcode', icon: 'qr-code' },
        { titleKey: 'menu.items.transferJournal', url: '/inventory/transfer-journal', icon: 'git-compare' },
      ]
    },
    {
      titleKey: 'menu.groups.purchaseOrder',
      icon: 'cube',
      expanded: false,
      items: [
        { titleKey: 'menu.items.productReceipt', url: '/purchase-order/list', icon: 'download' },
        { titleKey: 'menu.items.register',        url: '/purchase-order-register', icon: 'clipboard' },
        { titleKey: 'menu.items.barcodeReceipt', url: '/purchase-order/receive-by-barcode', icon: 'qr-code' },
        { titleKey: 'menu.items.scanPaperPo',   url: '/purchase-order/scan-document', icon: 'document-text' },
        { titleKey: 'menu.items.vendorReturn',   url: '/inventory/vendor-returns', icon: 'return-up-back' },
        { titleKey: 'menu.items.barcodeReturn',  url: '/inventory/vendor-returns/select-po', icon: 'qr-code' },
      ]
    },
    {
      titleKey: 'menu.groups.salesOrder',
      icon: 'cart',
      expanded: false,
      items: [
        { titleKey: 'menu.items.packingSlip', url: '/sales-order/list', icon: 'archive' },
        { titleKey: 'menu.items.reservation',  url: '/inventory/reservation', icon: 'bookmark' },
      ]
    },
    {
      titleKey: 'menu.groups.returnOrder',
      icon: 'arrow-undo',
      expanded: false,
      items: [
        { titleKey: 'menu.items.pickingSlip', url: '/sales-order/return-list', icon: 'list' },
      ]
    },
    {
      titleKey: 'menu.groups.project',
      icon: 'folder-open',
      expanded: false,
      items: [
        // { title: 'Project', url: '/inventory/project-issuance', icon: 'git-merge' },
        { titleKey: 'menu.items.itemRequirements', url: '/inventory/project-item-requirements', icon: 'list' },
        { titleKey: 'menu.items.itemJournal', url: '/inventory/project-item-journal', icon: 'document-text' },
      ]
    },
    {
      titleKey: 'menu.groups.production',
      icon: 'construct',
      expanded: false,
      items: [
        { titleKey: 'menu.items.pickingList',       url: '/inventory/production-picking', icon: 'list' },
        { titleKey: 'menu.items.reportAsFinished', url: '/inventory/report-as-finished', icon: 'checkmark-circle' },
      ]
    },
    {
      titleKey: 'menu.groups.warehouse',
      icon: 'business',
      expanded: false,
      items: [
        { titleKey: 'menu.items.licensePlate',         url: '/inventory/license-plate', icon: 'barcode' },
        { titleKey: 'menu.items.pickPut', url: '/inventory/pick-put',      icon: 'hand-right' },
        { titleKey: 'menu.items.packing',    url: '/inventory/packing',       icon: 'cube' },
      ]
    },
    {
      titleKey: 'menu.groups.inquiry',
      icon: 'search',
      expanded: false,
      items: [
        { titleKey: 'menu.items.onHandList',      url: '/inventory/on-hand',  icon: 'stats-chart' },
        { titleKey: 'menu.items.inventoryInquiry', url: '/inventory/inquiry',  icon: 'search' },
      ]
    },
    {
      titleKey: 'menu.groups.vanSales',
      icon: 'car',
      expanded: false,
      items: [
        { titleKey: 'menu.items.preSales',        url: null, icon: 'clipboard',     comingSoon: true },
        { titleKey: 'menu.items.vanSales',        url: '/inventory/van-sales', icon: 'car' },
        { titleKey: 'menu.items.orderManagement', url: null, icon: 'receipt',       comingSoon: true },
        { titleKey: 'menu.items.mobileInvoicing', url: null, icon: 'document-text', comingSoon: true },
        { titleKey: 'menu.items.vanStock',        url: null, icon: 'cube',          comingSoon: true },
      ]
    },
    {
      titleKey: 'menu.groups.routeTracking',
      icon: 'navigate',
      expanded: false,
      items: [
        { titleKey: 'menu.items.journeyPlan',        url: null, icon: 'calendar', comingSoon: true },
        { titleKey: 'menu.items.routeManagement',    url: null, icon: 'map',      comingSoon: true },
        { titleKey: 'menu.items.gpsTracking',        url: null, icon: 'locate',   comingSoon: true },
        { titleKey: 'menu.items.dispatchDelivery', url: null, icon: 'send',     comingSoon: true },
      ]
    },
    {
      titleKey: 'menu.groups.tradePayments',
      icon: 'pricetag',
      expanded: false,
      items: [
        { titleKey: 'menu.items.promotionsDeals', url: null, icon: 'pricetags',  comingSoon: true },
        { titleKey: 'menu.items.merchandising',      url: null, icon: 'storefront', comingSoon: true },
        { titleKey: 'menu.items.customerCredit',    url: null, icon: 'card',       comingSoon: true },
        { titleKey: 'menu.items.ePayment',          url: null, icon: 'wallet',     comingSoon: true },
      ]
    },
    {
      titleKey: 'menu.groups.performance',
      icon: 'trending-up',
      expanded: false,
      items: [
        { titleKey: 'menu.items.kpisTargets', url: null, icon: 'speedometer', comingSoon: true },
        { titleKey: 'menu.items.commission',     url: null, icon: 'cash',        comingSoon: true },
        { titleKey: 'menu.items.dashboards',     url: null, icon: 'bar-chart',   comingSoon: true },
        { titleKey: 'menu.items.smartReports',  url: null, icon: 'analytics',   comingSoon: true },
      ]
    },
    {
      titleKey: 'menu.groups.distribution',
      icon: 'git-network',
      expanded: false,
      items: [
        { titleKey: 'menu.items.distributorManagement', url: null, icon: 'people', comingSoon: true },
        { titleKey: 'menu.items.supervisorApp',         url: null, icon: 'eye',    comingSoon: true },
        { titleKey: 'menu.items.erpIntegration',        url: null, icon: 'sync',   comingSoon: true },
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

  readonly lang = this.languageService.lang;
  /** The label for the language the toggle switches *to*, in that language. */
  readonly nextLangLabel = computed(() =>
    this.languageService.next() === 'ar' ? 'العربية' : 'English',
  );

  /** Who is signed in, straight from the session store. */
  readonly isSignedIn = this.session.isAuthenticated;
  readonly displayName = this.session.displayName;
  readonly workspaceName = this.session.workspaceName;

  isAuthPage(): boolean { return this.currentUrl.startsWith('/auth'); }

  /** Fire and forget: `signOut` clears locally and routes, whatever the server says. */
  logout(): void { void this.userAuth.signOut(); }

  isTab(path: string): boolean {
    return this.currentUrl.startsWith(path);
  }

  isInventoryTab(): boolean {
    return this.currentUrl.startsWith('/inventory') &&
           !this.currentUrl.startsWith('/inventory/ai-hub');
  }

  async openProfile() {
    const toast = await this.toastCtrl.create({
      message: this.translate.instant('app.profileComingSoon') as string,
      buttons: [{ text: this.translate.instant('common.dismiss') as string, role: 'cancel' }],
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

  /** Key for the active theme's name, so the label follows the language. */
  get themeLabelKey(): string {
    return `menu.theme.${this.themeMode()}`;
  }

  toggleTheme() {
    this.themeService.toggle();
  }

  /**
   * Switches language. This reloads the app — see `LanguageService.setLang` —
   * which is why it lives in the menu and not on a working screen.
   */
  toggleLanguage() {
    void this.languageService.setLang(this.languageService.next());
  }
}

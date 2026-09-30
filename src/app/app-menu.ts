/**
 * The navigation menu, and the module each group belongs to.
 *
 * Extracted from `AppComponent` because it is data, not behaviour: a hundred
 * and fifty lines of it sitting in the middle of a component made the twenty
 * lines that actually do something hard to find, and made this list impossible
 * to assert against in a test without standing up the whole shell.
 *
 * ### Modules
 *
 * Every group carries a `moduleKey`, which names a row in the admin portal's
 * `module` catalogue. The portal decides which of them a tenant holds; this app
 * renders the groups that survive `TenantConfigStore.hasModule`. The two lists
 * are one-for-one and deliberately so — an operator ticking "Production" in the
 * portal and a driver seeing the Production group in this menu are the same
 * fact, and a key here with no counterpart there is a group nobody can ever
 * turn on.
 *
 * Keys are string literals rather than an import from `@growpath/contracts`.
 * This app is a separate repository and does not depend on that package; the
 * portal's contract is the authority, and these are hand-kept in step with it,
 * the same way `tenant-config.models.ts` mirrors the response schemas.
 */

import type { VanAction } from './core/van-sales/van-sales.models';

/**
 * A navigation entry.
 *
 * `titleKey` rather than a title: the menu renders in whichever language the
 * user chose, so a label baked in here could never follow. The wording lives in
 * `assets/i18n`, under `menu.*`.
 */
export interface MenuItem {
  titleKey: string;
  url: string | null;
  icon: string;
  comingSoon?: boolean;
  /**
   * Highlight only on this exact url. Needed when another item's url sits
   * underneath this one — otherwise both light up at once.
   */
  exact?: boolean;
  /**
   * Van Sales only: the item shows when the rep's role may take any of these
   * actions (VAN_SALES_UPDATE_SPEC.md §3). Absent means everyone in the group.
   */
  vanActions?: VanAction[];
}

export interface MenuGroup {
  /**
   * The entitlement that reveals this group.
   *
   * Matches a `key` in the portal's module catalogue. A group whose module the
   * tenant does not hold is not rendered at all — not greyed out, not marked
   * "unavailable". A disabled row advertises what a customer has not bought,
   * which is a sales conversation the app should not be starting on its own.
   */
  moduleKey: string;
  titleKey: string;
  icon: string;
  items: MenuItem[];
}

/**
 * Every group this build knows how to render, in display order.
 *
 * The order matches `sort_order` in the portal's catalogue, so the list an
 * operator ticks and the menu a driver scrolls read the same way.
 */
export const MENU_GROUPS: readonly MenuGroup[] = [
  {
    moduleKey: 'inventory',
    titleKey: 'menu.groups.inventory',
    icon: 'layers',
    items: [
      { titleKey: 'menu.items.moduleDashboard', url: '/module-dashboard/inventory', icon: 'speedometer' },
      { titleKey: 'menu.items.transferOrder', url: '/transfer-order/list', icon: 'swap-horizontal' },
      { titleKey: 'menu.items.countCycle', url: '/inventory/cycle-count', icon: 'refresh-circle' },
      { titleKey: 'menu.items.barcodeCount', url: '/inventory/cycle-count/count-by-barcode', icon: 'qr-code' },
      { titleKey: 'menu.items.transferJournal', url: '/inventory/transfer-journal', icon: 'git-compare' },
    ],
  },
  {
    moduleKey: 'purchase-order',
    titleKey: 'menu.groups.purchaseOrder',
    icon: 'cube',
    items: [
      { titleKey: 'menu.items.moduleDashboard', url: '/module-dashboard/purchase-order', icon: 'speedometer' },
      { titleKey: 'menu.items.productReceipt', url: '/purchase-order/list', icon: 'download' },
      { titleKey: 'menu.items.register', url: '/purchase-order-register', icon: 'clipboard' },
      { titleKey: 'menu.items.barcodeReceipt', url: '/purchase-order/receive-by-barcode', icon: 'qr-code' },
      { titleKey: 'menu.items.scanPaperPo', url: '/purchase-order/scan-document', icon: 'document-text' },
      { titleKey: 'menu.items.vendorReturn', url: '/inventory/vendor-returns', icon: 'return-up-back' },
      { titleKey: 'menu.items.barcodeReturn', url: '/inventory/vendor-returns/select-po', icon: 'qr-code' },
    ],
  },
  {
    moduleKey: 'sales-order',
    titleKey: 'menu.groups.salesOrder',
    icon: 'cart',
    items: [
      { titleKey: 'menu.items.moduleDashboard', url: '/module-dashboard/sales-order', icon: 'speedometer' },
      { titleKey: 'menu.items.packingSlip', url: '/sales-order/list', icon: 'archive' },
      { titleKey: 'menu.items.reservation', url: '/inventory/reservation', icon: 'bookmark' },
    ],
  },
  {
    moduleKey: 'return-order',
    titleKey: 'menu.groups.returnOrder',
    icon: 'arrow-undo',
    items: [
      { titleKey: 'menu.items.moduleDashboard', url: '/module-dashboard/return-order', icon: 'speedometer' },
      { titleKey: 'menu.items.pickingSlip', url: '/sales-order/return-list', icon: 'list' },
    ],
  },
  {
    moduleKey: 'project',
    titleKey: 'menu.groups.project',
    icon: 'folder-open',
    items: [
      { titleKey: 'menu.items.moduleDashboard', url: '/module-dashboard/project', icon: 'speedometer' },
      { titleKey: 'menu.items.itemRequirements', url: '/inventory/project-item-requirements', icon: 'list' },
      { titleKey: 'menu.items.itemJournal', url: '/inventory/project-item-journal', icon: 'document-text' },
    ],
  },
  {
    moduleKey: 'production',
    titleKey: 'menu.groups.production',
    icon: 'construct',
    items: [
      { titleKey: 'menu.items.moduleDashboard', url: '/module-dashboard/production', icon: 'speedometer' },
      { titleKey: 'menu.items.pickingList', url: '/inventory/production-picking', icon: 'list' },
      { titleKey: 'menu.items.reportAsFinished', url: '/inventory/report-as-finished', icon: 'checkmark-circle' },
    ],
  },
  {
    moduleKey: 'warehouse',
    titleKey: 'menu.groups.warehouse',
    icon: 'business',
    items: [
      { titleKey: 'menu.items.moduleDashboard', url: '/module-dashboard/warehouse', icon: 'speedometer' },
      { titleKey: 'menu.items.licensePlate', url: '/inventory/license-plate', icon: 'barcode' },
      { titleKey: 'menu.items.pickPut', url: '/inventory/pick-put', icon: 'hand-right' },
      { titleKey: 'menu.items.packing', url: '/inventory/packing', icon: 'cube' },
    ],
  },
  {
    moduleKey: 'inquiry',
    titleKey: 'menu.groups.inquiry',
    icon: 'search',
    items: [
      { titleKey: 'menu.items.moduleDashboard', url: '/module-dashboard/inquiry', icon: 'speedometer' },
      { titleKey: 'menu.items.onHandList', url: '/inventory/on-hand', icon: 'stats-chart' },
      { titleKey: 'menu.items.inventoryInquiry', url: '/inventory/inquiry', icon: 'search' },
    ],
  },
  {
    moduleKey: 'van-sales',
    titleKey: 'menu.groups.vanSales',
    icon: 'car',
    // One entry per job a rep does outside a visit. Selling, returns and surveys
    // happen inside a customer visit, so they are reached from the route, not
    // from here. Each item shows only to the roles that do that job (§3).
    items: [
      { titleKey: 'menu.items.moduleDashboard', url: '/inventory/van-sales/reports', icon: 'speedometer' },
      { titleKey: 'menu.items.todaysRoute', url: '/inventory/van-sales', icon: 'map', exact: true, vanActions: ['SELL', 'TAKE_ORDER', 'DELIVER', 'COLLECT'] },
      { titleKey: 'menu.items.preSalesOrders', url: '/inventory/van-sales/orders', icon: 'clipboard', vanActions: ['TAKE_ORDER'] },
      { titleKey: 'menu.items.deliveries', url: '/inventory/van-sales/deliveries', icon: 'send', vanActions: ['DELIVER'] },
      { titleKey: 'menu.items.collections', url: '/inventory/van-sales/collections', icon: 'cash', vanActions: ['COLLECT'] },
      { titleKey: 'menu.items.vanStock', url: '/inventory/van-sales/stock', icon: 'cube', vanActions: ['VAN_STOCK'] },
      { titleKey: 'menu.items.newCustomerRequest', url: '/inventory/van-sales/new-customer', icon: 'person-add', vanActions: ['NEW_CUSTOMER'] },
      { titleKey: 'menu.items.syncDayClose', url: '/inventory/van-sales/day-close', icon: 'sync', vanActions: ['DAY_CLOSE'] },
      { titleKey: 'menu.items.supervisor', url: '/inventory/van-sales/supervisor', icon: 'shield-checkmark', vanActions: ['APPROVE'] },
      { titleKey: 'menu.items.surveyBuilder', url: '/inventory/van-sales/surveys', icon: 'clipboard', vanActions: ['MANAGE_SURVEYS'] },
    ],
  },
  {
    moduleKey: 'route-tracking',
    titleKey: 'menu.groups.routeTracking',
    icon: 'navigate',
    items: [
      { titleKey: 'menu.items.journeyPlan', url: null, icon: 'calendar', comingSoon: true },
      { titleKey: 'menu.items.routeManagement', url: null, icon: 'map', comingSoon: true },
      { titleKey: 'menu.items.gpsTracking', url: null, icon: 'locate', comingSoon: true },
      { titleKey: 'menu.items.dispatchDelivery', url: null, icon: 'send', comingSoon: true },
    ],
  },
  {
    moduleKey: 'trade-payments',
    titleKey: 'menu.groups.tradePayments',
    icon: 'pricetag',
    items: [
      { titleKey: 'menu.items.promotionsDeals', url: null, icon: 'pricetags', comingSoon: true },
      { titleKey: 'menu.items.merchandising', url: null, icon: 'storefront', comingSoon: true },
      { titleKey: 'menu.items.customerCredit', url: null, icon: 'card', comingSoon: true },
      { titleKey: 'menu.items.ePayment', url: null, icon: 'wallet', comingSoon: true },
    ],
  },
  {
    moduleKey: 'performance',
    titleKey: 'menu.groups.performance',
    icon: 'trending-up',
    items: [
      { titleKey: 'menu.items.kpisTargets', url: null, icon: 'speedometer', comingSoon: true },
      { titleKey: 'menu.items.commission', url: null, icon: 'cash', comingSoon: true },
      { titleKey: 'menu.items.dashboards', url: null, icon: 'bar-chart', comingSoon: true },
      { titleKey: 'menu.items.smartReports', url: null, icon: 'analytics', comingSoon: true },
    ],
  },
  {
    moduleKey: 'distribution',
    titleKey: 'menu.groups.distribution',
    icon: 'git-network',
    items: [
      { titleKey: 'menu.items.distributorManagement', url: null, icon: 'people', comingSoon: true },
      { titleKey: 'menu.items.supervisorApp', url: null, icon: 'eye', comingSoon: true },
      { titleKey: 'menu.items.erpIntegration', url: null, icon: 'sync', comingSoon: true },
    ],
  },
];

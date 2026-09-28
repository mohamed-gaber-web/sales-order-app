import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { filter, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import {
  LanguageService,
  PortalSessionStore,
  SETUP_REQUIRED_ROUTE,
  TenantConfigStore,
  ThemeService,
  UserAuthService,
} from './core';
import { MENU_GROUPS, MenuGroup } from './app-menu';
import { VanRoleService } from './core/van-sales/van-role.service';

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
  private readonly tenantConfig = inject(TenantConfigStore);
  private readonly vanRole = inject(VanRoleService);

  /**
   * The menu this tenant actually has.
   *
   * `MENU_GROUPS` is everything this build can render; the portal decides which
   * of it a customer has bought. A group whose module is not held is absent
   * rather than disabled — a greyed-out row advertises what a customer has not
   * paid for, which is a sales conversation the app should not start by itself.
   *
   * Empty until `TenantConfigService.load()` settles, which is the safe way
   * round: showing nothing for the moment before the entitlements arrive is
   * recoverable, and showing everything and then taking it away is what a user
   * reports as a bug. `hasModule` returns false for an unknown key, so a group
   * added to this build before its module reaches the catalogue stays hidden
   * rather than appearing for everybody.
   */
  readonly visibleGroups = computed(() =>
    MENU_GROUPS.filter(group => this.tenantConfig.hasModule(group.moduleKey)).map(group => ({
      ...group,
      // Inside a group, an item tied to van-sales actions shows only to a role
      // that may take one of them — a collector has no business in Deliveries.
      items: group.items.filter(item => !item.vanActions || item.vanActions.some(a => this.vanRole.can(a))),
    })),
  );

  /**
   * Which group is open, by module key.
   *
   * A signal holding one key rather than an `expanded` flag on each group.
   * `MENU_GROUPS` is a shared constant now, so a boolean written onto its
   * objects would be process-wide state living on a module-level array — it
   * would survive sign-out and follow the next user in.
   */
  readonly expandedGroup = signal<string | null>(null);

  isExpanded(group: MenuGroup): boolean {
    return this.expandedGroup() === group.moduleKey;
  }

  /** Accordion: opening one closes the rest. */
  toggleGroup(group: MenuGroup): void {
    this.expandedGroup.update(open => (open === group.moduleKey ? null : group.moduleKey));
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

  /**
   * The setup screen stands alone, like the sign-in screens.
   *
   * It is reached only when the workspace cannot talk to Dynamics at all — no
   * environment, no credential, or one the ERP is rejecting.
   */
  isSetupRequiredPage(): boolean {
    return this.currentUrl.startsWith(SETUP_REQUIRED_ROUTE);
  }

  /**
   * Whether to render the menu and the bottom tabs at all.
   *
   * False on the sign-in screens, and false on the setup screen — which is the
   * part that was missing. A workspace with no Dynamics environment reaches
   * `/setup-required`, and every entry in that menu leads to a screen whose
   * every request fails: the sidebar and the tab bar were offering a rep a
   * choice of twenty ways to see an empty list, with a message explaining why
   * hidden behind them.
   *
   * Route-based rather than reading `TenantConfigStore.blocker()`, deliberately.
   * `erpConfiguredGuard` already guarantees a blocked workspace is *on* this
   * route, so the route is the settled answer; the store's is not settled until
   * the first fetch returns, and driving chrome from it would paint a full menu
   * on launch and then tear it away a moment later.
   */
  showsAppChrome(): boolean {
    return !this.isAuthPage() && !this.isSetupRequiredPage();
  }

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

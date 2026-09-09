import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterModule } from '@angular/router';
import { provideTranslateService, TranslatePipe } from '@ngx-translate/core';

import { AppComponent } from './app.component';
import { MENU_GROUPS } from './app-menu';
import { TenantConfigStore } from './core';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      // `TranslatePipe` is standalone, and the shell's own template uses it.
      imports: [RouterModule.forRoot([]), TranslatePipe],
      providers: [
        // The shell reads the signed-in user from PortalSessionStore, which
        // reaches the portal API through HttpClient.
        provideHttpClient(),
        provideHttpClientTesting(),
        // No loader: the tests assert behaviour, not wording, so an empty
        // dictionary is enough and keeps them off the network.
        provideTranslateService(),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('hides the app chrome on the auth screens', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.currentUrl = '/auth/login';
    expect(app.isAuthPage()).toBeTrue();

    app.currentUrl = '/dashboard';
    expect(app.isAuthPage()).toBeFalse();
  });

  it('shows no user until someone is signed in', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance.isSignedIn()).toBeFalse();
    expect(fixture.componentInstance.displayName()).toBe('');
  });

  /**
   * The sidebar shows the modules the admin portal granted, and nothing else.
   *
   * The store is populated directly rather than through `TenantConfigService`,
   * because what is under test is the filtering — not the fetch, which
   * `tenant-config.spec.ts` already covers.
   */
  describe('module entitlements filter the menu', () => {
    function grant(...keys: string[]): AppComponent {
      const fixture = TestBed.createComponent(AppComponent);
      TestBed.inject(TenantConfigStore).set({
        connections: [],
        companies: [],
        modules: keys.map(key => ({ key, description: '', enabled: true, enabledAt: null })),
      });
      return fixture.componentInstance;
    }

    it('shows nothing before the entitlements have loaded', () => {
      // The safe way round. Showing nothing for the moment before the fetch
      // settles is recoverable; showing every group and then taking most of
      // them away is what a user reports as a bug.
      const fixture = TestBed.createComponent(AppComponent);
      expect(fixture.componentInstance.visibleGroups()).toEqual([]);
    });

    it('shows only the groups whose module the tenant holds', () => {
      const app = grant('warehouse', 'van-sales');

      expect(app.visibleGroups().map(group => group.moduleKey)).toEqual([
        'warehouse',
        'van-sales',
      ]);
    });

    it('keeps the catalogue order rather than the order granted', () => {
      // `warehouse` sorts before `van-sales` in the portal's catalogue, so it
      // does here too — the list an operator ticks and the menu a driver
      // scrolls read the same way.
      const app = grant('van-sales', 'warehouse');
      expect(app.visibleGroups().map(group => group.moduleKey)).toEqual([
        'warehouse',
        'van-sales',
      ]);
    });

    it('ignores a module the catalogue has but this build does not render', () => {
      const app = grant('warehouse', 'a-module-from-a-newer-portal');
      expect(app.visibleGroups().map(group => group.moduleKey)).toEqual(['warehouse']);
    });

    it('shows every group when the tenant holds the whole catalogue', () => {
      const app = grant(...MENU_GROUPS.map(group => group.moduleKey));
      expect(app.visibleGroups().length).toBe(MENU_GROUPS.length);
    });

    it('opens one group at a time, and closes the open one', () => {
      const app = grant('warehouse', 'van-sales');
      const [warehouse, vanSales] = app.visibleGroups();

      expect(app.isExpanded(warehouse)).toBeFalse();

      app.toggleGroup(warehouse);
      expect(app.isExpanded(warehouse)).toBeTrue();

      // Accordion: opening the second closes the first.
      app.toggleGroup(vanSales);
      expect(app.isExpanded(warehouse)).toBeFalse();
      expect(app.isExpanded(vanSales)).toBeTrue();

      // Toggling the open one closes it rather than reopening it.
      app.toggleGroup(vanSales);
      expect(app.isExpanded(vanSales)).toBeFalse();
    });
  });

  /**
   * The menu and tab bar are hidden wherever they would be a trap.
   *
   * A workspace with no Dynamics environment is sent to `/setup-required`, and
   * every entry in the menu leads to a screen whose requests all fail. Showing
   * the chrome there offered a rep twenty routes to an empty list and buried
   * the one message that said why.
   */
  describe('app chrome visibility', () => {
    function at(url: string): AppComponent {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.componentInstance.currentUrl = url;
      return fixture.componentInstance;
    }

    it('hides the chrome on the sign-in screens', () => {
      expect(at('/auth/login').showsAppChrome()).toBeFalse();
      expect(at('/auth/mfa').showsAppChrome()).toBeFalse();
    });

    it('hides the chrome on the setup screen', () => {
      // The regression: a tenant with no environment saw a full sidebar and
      // bottom tab bar on top of the page explaining that nothing works.
      expect(at('/setup-required').showsAppChrome()).toBeFalse();
      expect(at('/setup-required').isSetupRequiredPage()).toBeTrue();
    });

    it('shows the chrome on a working screen', () => {
      expect(at('/dashboard').showsAppChrome()).toBeTrue();
      expect(at('/inventory/on-hand').showsAppChrome()).toBeTrue();
    });

    it('keeps the setup screen chromeless even with modules granted', () => {
      // Entitlements do not rescue a workspace that cannot reach the ERP: the
      // groups would render, and every screen behind them would still fail.
      const fixture = TestBed.createComponent(AppComponent);
      TestBed.inject(TenantConfigStore).set({
        connections: [],
        companies: [],
        modules: [
          { key: 'inventory', description: '', enabled: true, enabledAt: null },
          { key: 'warehouse', description: '', enabled: true, enabledAt: null },
        ],
      });
      const app = fixture.componentInstance;
      app.currentUrl = '/setup-required';

      expect(app.visibleGroups().length).toBe(2);
      expect(app.showsAppChrome()).toBeFalse();
    });
  });
});

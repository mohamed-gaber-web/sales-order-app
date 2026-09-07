import { inject, LOCALE_ID, NgModule, provideAppInitializer } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import {
  provideHttpClient,
  withInterceptorsFromDi,
  HTTP_INTERCEPTORS,
} from '@angular/common/http';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { provideTranslateService, TranslatePipe } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import localeArExtra from '@angular/common/locales/extra/ar';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import {
  LanguageService,
  LookupService,
  localeFor,
  MobileConfigService,
  PortalAuthInterceptor,
  PortalSessionStore,
  TenantConfigService,
  UserAuthService,
  restoreSession,
  persistedLang,
} from './core';

registerLocaleData(localeAr, 'ar', localeArExtra);

/**
 * Everything that must settle before the first route resolves.
 *
 * Order matters. The runtime configuration resolves first, because it names the
 * API host every later call uses. The session is restored next so `authGuard`
 * sees a settled answer rather than racing it. The lookups run last and **only
 * for a signed-in user** — they are ERP reads that now travel through the portal
 * carrying that user's token, so there is nothing to fetch until someone has
 * signed in.
 *
 * Nothing here is allowed to stop the app booting: a failed lookup leaves an
 * empty list, which the screens already handle, while a failed initializer
 * leaves a blank page.
 */
async function initializeApp(): Promise<void> {
  const language = inject(LanguageService);
  const session = inject(PortalSessionStore);
  const userAuth = inject(UserAuthService);
  const lookup = inject(LookupService);
  const mobileConfig = inject(MobileConfigService);
  const tenantConfig = inject(TenantConfigService);

  try {
    // Before anything renders. A screen that paints before the direction is
    // set flashes left-to-right and then jumps.
    await language.initialize();

    // Then this, because it decides where every later request goes. Cache-first, so
    // this costs nothing after the first launch and cannot strand a device that
    // starts up offline.
    const { tenantChanged } = await mobileConfig.bootstrap();

    // A refresh token issued by one installation means nothing to another, and
    // a stale identity would name the wrong workspace on screen.
    if (tenantChanged) session.clear();

    await restoreSession(session, userAuth);

    if (session.isAuthenticated()) {
      // Before the lookups, and before the first route: `erpConfiguredGuard`
      // reads this, and a guard that evaluated on an unsettled answer would let
      // a user into screens that cannot load.
      await tenantConfig.load();
      await lookup.loadAll();
    }
  } catch (error) {
    console.error('App initialization error:', error);
  }
}

@NgModule({
  declarations: [AppComponent],
  // `TranslatePipe` is standalone in v18, so the shell's own template gets it
  // here; every feature module inherits it from `DesignSystemModule`.
  imports: [BrowserModule, IonicModule.forRoot(), AppRoutingModule, TranslatePipe],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideHttpClient(withInterceptorsFromDi()),
    provideTranslateService({
      // `useHttpBackend` fetches the JSON below the interceptor chain, so the
      // portal bearer is never attached to a static asset and the loader
      // cannot deadlock against an interceptor that itself needs HttpClient.
      loader: provideTranslateHttpLoader({
        prefix: 'assets/i18n/',
        suffix: '.json',
        useHttpBackend: true,
      }),
      fallbackLang: 'en',
      lang: persistedLang(),
    }),
    // Resolved once, before any service exists — hence the bare function rather
    // than a `LanguageService` read. Changing language reloads the app so the
    // `date` and `number` pipes pick up the new value.
    { provide: LOCALE_ID, useFactory: () => localeFor(persistedLang()) },
    provideAppInitializer(() => initializeApp()),
    // One interceptor now, not two. The Azure `client_credentials` machine token
    // is gone — ERP requests sit under the portal's origin and carry the
    // signed-in user's bearer like every other portal call.
    { provide: HTTP_INTERCEPTORS, useClass: PortalAuthInterceptor, multi: true },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}

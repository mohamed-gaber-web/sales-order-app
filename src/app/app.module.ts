import { inject, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import {
  provideHttpClient,
  withInterceptorsFromDi,
  HTTP_INTERCEPTORS,
} from '@angular/common/http';
import { provideAppInitializer } from '@angular/core';
import { from, forkJoin, switchMap, map, Observable } from 'rxjs';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { AuthService, AuthInterceptor, LookupService } from './core';

function initializeApp(): Observable<void> {
  const auth = inject(AuthService);
  const lookup = inject(LookupService);
  return from(auth.initialize()).pipe(
    switchMap(() =>
      forkJoin([
        lookup.loadCompanies(),
        lookup.loadCurrencies(),
        lookup.loadCustomers(),
      ])
    ),
    map(() => void 0)
  );
}

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, IonicModule.forRoot(), AppRoutingModule],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideHttpClient(withInterceptorsFromDi()),
    provideAppInitializer(() => initializeApp()),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true,
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}

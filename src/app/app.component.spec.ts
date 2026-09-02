import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterModule } from '@angular/router';

import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      imports: [RouterModule.forRoot([])],
      // The shell reads the signed-in user from PortalSessionStore, which
      // reaches the portal API through HttpClient.
      providers: [provideHttpClient(), provideHttpClientTesting()],
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
});

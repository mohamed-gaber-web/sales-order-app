import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, from, switchMap, catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private authService: AuthService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // Skip token injection for the token endpoint itself
    if (req.url.includes('oauth2/v2.0/token') || req.url.includes('/api/token')) {
      return next.handle(req);
    }

    // Only attach token to requests going to our API
    // Dev: apiBaseUrl is '' so paths are relative (/data/...)
    // Prod/native: apiBaseUrl is the full D365 URL
    if (!req.url.startsWith(environment.apiBaseUrl + '/data')) {
      return next.handle(req);
    }

    return from(this.authService.getToken()).pipe(
      switchMap((token) => {
        const authReq = req.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
        });
        return next.handle(authReq);
      }),
      catchError((error: HttpErrorResponse) => {
        // If 401, clear token and retry once with a fresh token
        if (error.status === 401) {
          this.authService.clearToken();
          return from(this.authService.getToken()).pipe(
            switchMap((newToken) => {
              const retryReq = req.clone({
                setHeaders: { Authorization: `Bearer ${newToken}` },
              });
              return next.handle(retryReq);
            })
          );
        }
        return throwError(() => error);
      })
    );
  }
}

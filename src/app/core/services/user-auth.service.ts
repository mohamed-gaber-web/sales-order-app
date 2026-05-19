import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

const SESSION_KEY = 'gp_auth_user';

export interface GpUser { email: string; name: string; }

@Injectable({ providedIn: 'root' })
export class UserAuthService {
  constructor(private router: Router) {}

  isAuthenticated(): boolean {
    return !!localStorage.getItem(SESSION_KEY);
  }

  getUser(): GpUser | null {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  signIn(email: string): void {
    const parts = email.split('@')[0].replace(/[._]/g, ' ').split(' ');
    const name = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email, name }));
  }

  signOut(): void {
    localStorage.removeItem(SESSION_KEY);
    this.router.navigateByUrl('/auth/login');
  }
}

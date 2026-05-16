import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'gp-theme-mode';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>('system');
  readonly isDark = signal(false);

  private systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    // Listen for system theme changes
    this.systemDarkQuery.addEventListener('change', () => {
      if (this.mode() === 'system') {
        this.applyTheme(this.systemDarkQuery.matches);
      }
    });
  }

  /** Call once during app bootstrap */
  initialize() {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    const mode = saved ?? 'system';
    this.setMode(mode);
  }

  setMode(mode: ThemeMode) {
    this.mode.set(mode);
    localStorage.setItem(STORAGE_KEY, mode);

    const dark = mode === 'dark' || (mode === 'system' && this.systemDarkQuery.matches);
    this.applyTheme(dark);
  }

  toggle() {
    // Cycle: system -> light -> dark -> system
    const next: Record<ThemeMode, ThemeMode> = {
      system: 'light',
      light: 'dark',
      dark: 'system',
    };
    this.setMode(next[this.mode()]);
  }

  private applyTheme(dark: boolean) {
    this.isDark.set(dark);
    document.body.classList.toggle('ion-palette-dark', dark);
  }
}

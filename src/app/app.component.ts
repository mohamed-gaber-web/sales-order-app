import { Component, OnInit } from '@angular/core';
import { ThemeService } from './core';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  public appPages = [
    { title: 'Dashboard', url: '/dashboard', icon: 'grid' },
    { title: 'Purchase Orders', url: '/purchase-order/list', icon: 'cube' },
    { title: 'Sales Orders', url: '/sales-order/list', icon: 'cart' },
    { title: 'Transfer Orders', url: '/transfer-order/list', icon: 'swap-horizontal' },
  ];

  showSplash = true;
  splashFading = false;

  readonly themeMode = this.themeService.mode;
  readonly isDark = this.themeService.isDark;

  constructor(private themeService: ThemeService) {}

  ngOnInit() {
    this.themeService.initialize();
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

  get themeLabel(): string {
    const mode = this.themeMode();
    if (mode === 'dark') return 'Dark';
    if (mode === 'light') return 'Light';
    return 'System';
  }

  toggleTheme() {
    this.themeService.toggle();
  }
}

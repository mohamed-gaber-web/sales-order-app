import { NgModule, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { CanActivateFn, Router, RouterModule, Routes } from '@angular/router';
import { TenantConfigStore } from '../../core/tenant';
import { ChartsModule } from '../../shared/charts';
import { DesignSystemModule } from '../../shared/design-system/design-system.module';
import { findDashboard } from './module-dashboard.definitions';
import { ModuleDashboardPage } from './module-dashboard.page';

/**
 * Only for a module this workspace holds — the same rule the menu follows. An
 * unknown module key, or one the tenant has not bought, goes home. Before the
 * tenant configuration has loaded the answer is unknown, and unknown is let
 * through, as `erpConfiguredGuard` does.
 */
const moduleEntitledGuard: CanActivateFn = (route) => {
  const key = route.paramMap.get('module') ?? '';
  const config = inject(TenantConfigStore);
  const known = !!findDashboard(key);
  if (known && (!config.loaded() || config.hasModule(key))) return true;
  return inject(Router).createUrlTree(['/dashboard']);
};

const routes: Routes = [{ path: ':module', component: ModuleDashboardPage, canActivate: [moduleEntitledGuard] }];

@NgModule({
  imports: [CommonModule, IonicModule, RouterModule.forChild(routes), DesignSystemModule, ChartsModule],
  declarations: [ModuleDashboardPage],
})
export class ModuleDashboardModule {}

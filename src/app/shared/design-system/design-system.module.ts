import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { TranslateDirective, TranslatePipe } from '@ngx-translate/core';

import { DsPillComponent } from './components/ds-pill/ds-pill.component';
import { DsEmptyStateComponent } from './components/ds-empty-state/ds-empty-state.component';
import { DsStatComponent } from './components/ds-stat/ds-stat.component';
import { DsButtonComponent } from './components/ds-button/ds-button.component';
import { DsSearchComponent } from './components/ds-search/ds-search.component';
import { DsToggleRowComponent } from './components/ds-toggle-row/ds-toggle-row.component';
import { DsCtaBarComponent } from './components/ds-cta-bar/ds-cta-bar.component';
import { DsFormFieldComponent } from './components/ds-form-field/ds-form-field.component';
import { DsProgressComponent } from './components/ds-progress/ds-progress.component';
import { LanguageToggleComponent } from './components/language-toggle/language-toggle.component';

const DS_COMPONENTS = [
  DsPillComponent,
  DsEmptyStateComponent,
  DsStatComponent,
  DsButtonComponent,
  DsSearchComponent,
  DsToggleRowComponent,
  DsCtaBarComponent,
  DsFormFieldComponent,
  DsProgressComponent,
  LanguageToggleComponent,
];

/**
 * `TranslatePipe` and `TranslateDirective` are standalone in ngx-translate v18
 * (`TranslateModule` was removed). Re-exporting them here hands `| translate`
 * to the 60 page modules that already import this module, instead of editing
 * each one.
 */
@NgModule({
  declarations: DS_COMPONENTS,
  imports: [CommonModule, FormsModule, IonicModule, TranslatePipe, TranslateDirective],
  exports: [...DS_COMPONENTS, TranslatePipe, TranslateDirective],
})
export class DesignSystemModule {}

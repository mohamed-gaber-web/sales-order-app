import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LanguageService } from '../../../../core/services/language.service';

/**
 * Switches the app's language, for screens that have no side menu.
 *
 * The menu's language item is inside `ion-split-pane`, which `AppComponent`
 * hides on `/auth`. That left the sign-in screen — the one screen every user
 * sees before anything else, and the first place an Arabic speaker needs the
 * app in Arabic — with no way to change it.
 *
 * Shows the language it switches **to**, written in that language, so it reads
 * correctly whichever way round you are: "العربية" while in English, "English"
 * while in Arabic. A label naming the *current* language is the classic version
 * of this control that nobody can interpret.
 *
 * Selector is `app-` rather than `ds-`: this is app behaviour, not a
 * presentational primitive, and the lint rule wants the app prefix.
 */
@Component({
  selector: 'app-language-toggle',
  templateUrl: './language-toggle.component.html',
  styleUrls: ['./language-toggle.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class LanguageToggleComponent {
  private readonly language = inject(LanguageService);

  /** The language this switches to, in its own script. */
  readonly label = computed(() => (this.language.next() === 'ar' ? 'العربية' : 'English'));

  /**
   * Switching reloads the page.
   *
   * `LOCALE_ID` is resolved once at injection, so the built-in `date` and
   * `number` pipes keep the locale they booted with — the reload is what makes
   * them agree with everything else. On these screens there is nothing to lose
   * but an unsubmitted form, and language is chosen before typing.
   */
  switch(): void {
    void this.language.setLang(this.language.next());
  }
}

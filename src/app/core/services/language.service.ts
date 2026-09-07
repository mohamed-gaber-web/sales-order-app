import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

/** The languages the app ships. Arabic is right-to-left. */
export type AppLang = 'en' | 'ar';

const STORAGE_KEY = 'gp-lang';
const DEFAULT_LANG: AppLang = 'en';

/**
 * Reads the stored language without needing the injector.
 *
 * `LOCALE_ID` is resolved once, before any service exists, so the factory that
 * provides it cannot ask `LanguageService` for the answer. Both read the same
 * key through this function instead.
 */
export function persistedLang(): AppLang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'ar' || saved === 'en' ? saved : DEFAULT_LANG;
  } catch {
    // Private browsing and some WebViews throw on access rather than returning
    // null. English is the safe answer.
    return DEFAULT_LANG;
  }
}

/** The Angular locale for a language. Arabic is pinned to Western digits. */
export function localeFor(lang: AppLang): string {
  return lang === 'ar' ? 'ar-u-nu-latn' : 'en-US';
}

/**
 * The active language, and the document direction that follows from it.
 *
 * Shaped after `ThemeService` — a signal plus `localStorage` — but initialised
 * from the app initializer rather than `ngOnInit`, because a screen that paints
 * before the direction is set flashes left-to-right and then jumps.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);

  readonly lang = signal<AppLang>(DEFAULT_LANG);
  readonly isRtl = computed(() => this.lang() === 'ar');

  /** Call once from the app initializer, before the first route resolves. */
  async initialize(): Promise<void> {
    const lang = persistedLang();
    this.lang.set(lang);
    this.applyToDocument(lang);
    // `use()` returns an Observable, not a Promise — awaiting it directly
    // resolves on the next microtask with the Observable itself, so the
    // initializer would finish before a single translation had loaded and the
    // first paint would show raw keys.
    await firstValueFrom(this.translate.use(lang));
  }

  /**
   * Switches language and reloads.
   *
   * `LOCALE_ID` is read once at injection time, so the built-in `date` and
   * `number` pipes keep the locale they booted with. Reloading is what makes
   * them agree with the rest of the UI. Everything the user could lose —
   * session, van cart, day state, drafts — is already in `localStorage` and is
   * restored by the app initializer.
   */
  async setLang(lang: AppLang): Promise<void> {
    if (lang === this.lang()) return;

    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Nothing to persist to. Apply it for this session anyway.
    }

    this.lang.set(lang);
    this.applyToDocument(lang);
    await firstValueFrom(this.translate.use(lang));

    this.reload();
  }

  /** Its own method so a test can observe the reload without performing one. */
  protected reload(): void {
    window.location.reload();
  }

  /** The other language — what a toggle switches to. */
  next(): AppLang {
    return this.lang() === 'en' ? 'ar' : 'en';
  }

  private applyToDocument(lang: AppLang) {
    const el = document.documentElement;
    el.lang = lang;
    el.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }
}

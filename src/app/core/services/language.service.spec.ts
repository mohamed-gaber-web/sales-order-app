import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { AppLang, LanguageService, localeFor, persistedLang } from './language.service';

const STORAGE_KEY = 'gp-lang';

describe('LanguageService', () => {
  let service: LanguageService;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');

    TestBed.configureTestingModule({
      // No loader: these tests assert direction and persistence, not wording.
      providers: [provideTranslateService()],
    });
    service = TestBed.inject(LanguageService);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  describe('persistedLang', () => {
    it('falls back to English when nothing has been chosen', () => {
      expect(persistedLang()).toBe('en');
    });

    it('reads a stored choice back', () => {
      localStorage.setItem(STORAGE_KEY, 'ar');
      expect(persistedLang()).toBe('ar');
    });

    it('ignores a value that is not a language we ship', () => {
      localStorage.setItem(STORAGE_KEY, 'fr');
      expect(persistedLang()).toBe('en');
    });
  });

  describe('localeFor', () => {
    it('pins Arabic to Western digits', () => {
      // Without `-u-nu-latn` CLDR would render ٠١٢٣, which is wrong for staff
      // keying quantities off a barcode label.
      expect(localeFor('ar')).toBe('ar-u-nu-latn');
      expect(new Intl.NumberFormat(localeFor('ar')).format(1234)).toBe('1,234');
    });

    it('uses en-US for English', () => {
      expect(localeFor('en')).toBe('en-US');
    });
  });

  describe('initialize', () => {
    it('leaves the document left-to-right for English', async () => {
      await service.initialize();

      expect(service.lang()).toBe('en');
      expect(service.isRtl()).toBeFalse();
      expect(document.documentElement.dir).toBe('ltr');
      expect(document.documentElement.lang).toBe('en');
    });

    it('turns the document right-to-left for a stored Arabic choice', async () => {
      localStorage.setItem(STORAGE_KEY, 'ar');

      await service.initialize();

      expect(service.lang()).toBe('ar');
      expect(service.isRtl()).toBeTrue();
      expect(document.documentElement.dir).toBe('rtl');
      expect(document.documentElement.lang).toBe('ar');
    });
  });

  describe('next', () => {
    it('offers the other language', async () => {
      await service.initialize();
      expect(service.next()).toBe('ar');

      localStorage.setItem(STORAGE_KEY, 'ar');
      await service.initialize();
      expect(service.next()).toBe('en');
    });
  });

  describe('setLang', () => {
    /** `setLang` reloads the page, which Karma must not actually do. */
    function stubReload(): jasmine.Spy {
      return spyOn(
        service as unknown as { reload: () => void },
        'reload',
      ).and.stub();
    }

    it('persists and applies the new language', async () => {
      await service.initialize();
      const reload = stubReload();

      await service.setLang('ar');

      expect(localStorage.getItem(STORAGE_KEY)).toBe('ar');
      expect(document.documentElement.dir).toBe('rtl');
      expect(document.documentElement.lang).toBe('ar');
      expect(service.isRtl()).toBeTrue();
      expect(reload).toHaveBeenCalled();
    });

    it('does nothing when the language is already active', async () => {
      await service.initialize();
      const reload = stubReload();

      await service.setLang('en' as AppLang);

      expect(reload).not.toHaveBeenCalled();
    });
  });
});

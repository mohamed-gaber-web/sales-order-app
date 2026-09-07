import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { FormatService } from './format.service';
import { LanguageService } from './language.service';

const STORAGE_KEY = 'gp-lang';

describe('FormatService', () => {
  let format: FormatService;
  let language: LanguageService;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    TestBed.configureTestingModule({
      providers: [provideTranslateService()],
    });
    format = TestBed.inject(FormatService);
    language = TestBed.inject(LanguageService);
  });

  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  describe('number', () => {
    it('groups thousands', () => {
      expect(format.number(1234567)).toBe('1,234,567');
    });

    it('keeps Western digits in Arabic', () => {
      language.lang.set('ar');
      // The whole point of the `-u-nu-latn` locale: a picker reading a
      // quantity off a label must see the same digits on screen.
      expect(format.number(1250, 2, 2)).toContain('1,250');
      expect(format.number(1250)).not.toMatch(/[٠-٩]/);
    });

    it('shows an em dash rather than NaN for a missing value', () => {
      expect(format.number(null)).toBe('—');
      expect(format.number(undefined)).toBe('—');
      expect(format.number(Number.NaN)).toBe('—');
    });
  });

  describe('currency', () => {
    it('formats a plain number when the ERP gave us no currency code', () => {
      // It must not invent a symbol — the old code hardcoded USD.
      expect(format.currency(1250)).toBe('1,250.00');
    });

    it('uses the code the ERP supplied', () => {
      expect(format.currency(1250, 'USD')).toContain('1,250.00');
    });

    it('degrades to number plus code for a code ISO 4217 does not know', () => {
      expect(format.currency(1250, 'XYZZY')).toBe('1,250.00 XYZZY');
    });

    it('shows an em dash for a missing amount', () => {
      expect(format.currency(null, 'USD')).toBe('—');
    });
  });

  describe('date', () => {
    const when = new Date(2026, 2, 12); // 12 March 2026

    it('formats an English date', () => {
      expect(format.date(when)).toBe('Mar 12, 2026');
    });

    it('reorders for Arabic without a second format string', () => {
      language.lang.set('ar');
      const out = format.date(when);
      // Arabic puts the day first; the year is still Western digits.
      expect(out).toContain('12');
      expect(out).toContain('2026');
      expect(out).not.toMatch(/[٠-٩]/);
    });

    it('shows an em dash for junk', () => {
      expect(format.date(null)).toBe('—');
      expect(format.date('')).toBe('—');
      expect(format.date('not a date')).toBe('—');
    });
  });

  describe('time', () => {
    it('is 24-hour', () => {
      expect(format.time(new Date(2026, 2, 12, 14, 5))).toBe('14:05');
    });
  });
});

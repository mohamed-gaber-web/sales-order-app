import { Injectable, inject } from '@angular/core';

import { LanguageService, localeFor } from './language.service';

/**
 * One place that turns numbers, money and dates into text.
 *
 * Before this, pages hand-rolled their own `formatDate` and `formatCurrency`
 * against a mix of `en-US` and `en-GB`, so the same date could read two ways on
 * two screens and `USD` was hardcoded next to amounts that were not dollars.
 *
 * The locale comes from `LanguageService`, and for Arabic it carries the
 * `-u-nu-latn` extension: CLDR would otherwise give Arabic-Indic digits (٠١٢٣),
 * which is wrong for people reading quantities off a barcode label and keying
 * them back in.
 */
@Injectable({ providedIn: 'root' })
export class FormatService {
  private readonly language = inject(LanguageService);

  /** The BCP-47 tag every formatter below is built from. */
  get locale(): string {
    return localeFor(this.language.lang());
  }

  /** A quantity or count. Defaults to whole numbers. */
  number(value: number | null | undefined, min = 0, max = 2): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return new Intl.NumberFormat(this.locale, {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    }).format(value);
  }

  /**
   * An amount of money.
   *
   * `code` is the ERP's own currency code and is never guessed — when it is
   * missing the amount is formatted as a plain number rather than silently
   * labelled as dollars.
   */
  currency(value: number | null | undefined, code?: string | null): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    if (!code) return this.number(value, 2, 2);

    try {
      return new Intl.NumberFormat(this.locale, {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      // An ERP code that ISO 4217 does not know throws. Show the number and the
      // code rather than nothing.
      return `${this.number(value, 2, 2)} ${code}`;
    }
  }

  /**
   * A date.
   *
   * The fields are named rather than ordered: `Intl` lays them out the way the
   * locale does, so this is `12 Mar 2026` in English and reorders itself in
   * Arabic without a second format string. (`dateStyle` would say the same
   * thing more briefly, but it needs an `es2020` lib and this project targets
   * `es2018`.)
   */
  date(value: string | number | Date | null | undefined): string {
    const d = toDate(value);
    if (!d) return '—';
    return new Intl.DateTimeFormat(this.locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  }

  /** A date with the day of the week — for headers that name today. */
  dateLong(value: string | number | Date | null | undefined): string {
    const d = toDate(value);
    if (!d) return '—';
    return new Intl.DateTimeFormat(this.locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(d);
  }

  /** A time of day, 24-hour — warehouse and route logs are read as timestamps. */
  time(value: string | number | Date | null | undefined): string {
    const d = toDate(value);
    if (!d) return '—';
    return new Intl.DateTimeFormat(this.locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  }

  /** A date and time together. */
  dateTime(value: string | number | Date | null | undefined): string {
    const d = toDate(value);
    if (!d) return '—';
    return new Intl.DateTimeFormat(this.locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  }
}

/** Anything the ERP might hand us, or null when it is not a usable date. */
function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

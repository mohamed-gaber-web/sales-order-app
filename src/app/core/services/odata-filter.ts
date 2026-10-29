/** A value inside an OData string literal: single quotes doubled. */
export function odataString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * "field starts with value" as a key range, for an environment that rejects
 * startswith(): `field ge 'AB' and field lt 'AC'`. Unlike a function call,
 * a range can be served from the field's index, so it stays fast on large
 * tables. The bound bumps the last character; a trailing 9 or Z can't be
 * bumped safely under SQL collation (punctuation sorts unpredictably), so
 * those cap with a run of Z's instead.
 */
export function prefixFilter(field: string, value: string): string {
  const v = value.toUpperCase();
  const last = v.slice(-1);
  const lower = `${field} ge '${odataString(v)}'`;
  if (/[0-8A-Y]/.test(last)) {
    const bumped = v.slice(0, -1) + String.fromCharCode(last.charCodeAt(0) + 1);
    return `${lower} and ${field} lt '${odataString(bumped)}'`;
  }
  return `${lower} and ${field} le '${odataString(v + 'ZZZZZZZZZZZZZZZZZZZZ')}'`;
}

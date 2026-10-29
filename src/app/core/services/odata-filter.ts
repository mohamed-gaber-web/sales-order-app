/** A value inside an OData string literal: single quotes doubled. */
export function odataString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * The term as a D365 wildcard pattern body. `*` is D365's wildcard and has no
 * escape, so one typed by the user is dropped rather than left to widen the
 * match.
 */
function wildcardBody(value: string): string {
  return odataString(value.replace(/\*/g, ''));
}

/**
 * "field starts with value", in the form D365 accepts: `field eq 'AB*'`.
 *
 * D365 rejects the OData string functions (startswith/contains) and also
 * range comparisons on strings (`ge`/`lt` answer 400). What it does take is a
 * `*` wildcard inside `eq`, which it runs as SQL LIKE 'AB%' — an index can
 * still serve a leading-text match, so it stays fast on large tables.
 */
export function prefixFilter(field: string, value: string): string {
  return `${field} eq '${wildcardBody(value)}*'`;
}

/**
 * "field contains value": `field eq '*AB*'`, D365's LIKE '%AB%'. A leading
 * wildcard can't use an index, so on a large table this is the slower of the
 * two — callers cap or time-box it.
 */
export function containsFilter(field: string, value: string): string {
  return `${field} eq '*${wildcardBody(value)}*'`;
}

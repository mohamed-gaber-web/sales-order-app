import { containsFilter, odataString, prefixFilter } from './odata-filter';

describe('odata filters', () => {
  it('doubles single quotes', () => {
    expect(odataString("O'Brien")).toBe("O''Brien");
  });

  it('writes "starts with" as a D365 wildcard eq', () => {
    expect(prefixFilter('ItemNumber', '622')).toBe("ItemNumber eq '622*'");
  });

  it('writes "contains" as a D365 wildcard eq', () => {
    expect(containsFilter('ProductName', 'cable')).toBe("ProductName eq '*cable*'");
  });

  it('escapes quotes and drops a typed wildcard', () => {
    expect(prefixFilter('F', "a'b")).toBe("F eq 'a''b*'");
    expect(containsFilter('F', '*x*')).toBe("F eq '*x*'");
  });
});

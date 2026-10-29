import { odataString, prefixFilter } from './odata-filter';

describe('odata filters', () => {
  it('doubles single quotes', () => {
    expect(odataString("O'Brien")).toBe("O''Brien");
  });

  it('turns a prefix into a key range on the next character', () => {
    expect(prefixFilter('ItemNumber', '6221')).toBe("ItemNumber ge '6221' and ItemNumber lt '6222'");
    expect(prefixFilter('ItemNumber', 'ab')).toBe("ItemNumber ge 'AB' and ItemNumber lt 'AC'");
  });

  it('caps a trailing 9 or Z with a run of Z instead of bumping it', () => {
    expect(prefixFilter('ItemNumber', '629')).toBe("ItemNumber ge '629' and ItemNumber le '629ZZZZZZZZZZZZZZZZZZZZ'");
    expect(prefixFilter('ItemNumber', 'AZ')).toBe("ItemNumber ge 'AZ' and ItemNumber le 'AZZZZZZZZZZZZZZZZZZZZZ'");
  });

  it('escapes quotes inside the range', () => {
    expect(prefixFilter('F', "a'b")).toBe("F ge 'A''B' and F lt 'A''C'");
  });
});

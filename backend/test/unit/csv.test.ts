import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '../../src/lib/csv.js';

describe('csv', () => {
  it('quotes separators, quotes and newlines', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('renders empty, numeric, boolean and object cells', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(false)).toBe('false');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('joins rows with CRLF and ends with a newline', () => {
    expect(toCsv(['a', 'b'], [[1, 'x'], [2, null]])).toBe('a,b\r\n1,x\r\n2,\r\n');
  });
});

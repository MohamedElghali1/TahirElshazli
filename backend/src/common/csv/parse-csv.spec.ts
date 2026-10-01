import { describe, expect, it } from 'vitest';
import { parseCsv } from './parse-csv.js';

describe('parseCsv', () => {
  it('splits a simple comma-separated row', () => {
    expect(parseCsv('a,b,c\r\n1,2,3\r\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('strips a leading UTF-8 BOM', () => {
    expect(parseCsv('﻿a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    expect(parseCsv('"she said ""hi""",b\n')).toEqual([['she said "hi"', 'b']]);
  });

  it('keeps a comma inside a quoted field', () => {
    expect(parseCsv('"a,b",c\n')).toEqual([['a,b', 'c']]);
  });

  it('keeps a CRLF newline inside a quoted field as one cell', () => {
    expect(parseCsv('"line1\r\nline2",b\n')).toEqual([['line1\r\nline2', 'b']]);
  });

  it('keeps a bare LF inside a quoted field as one cell', () => {
    expect(parseCsv('"line1\nline2",b\n')).toEqual([['line1\nline2', 'b']]);
  });

  it('handles a file with no trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('does not add a phantom row for the trailing newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('produces a one-empty-field row for a blank line', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toEqual([['a', 'b'], [''], ['1', '2']]);
  });

  it('round-trips Arabic text unmangled, quoted or not', () => {
    expect(parseCsv('السؤال الأول,"إجابة, بها فاصلة"\n')).toEqual([
      ['السؤال الأول', 'إجابة, بها فاصلة'],
    ]);
  });

  it('handles CR-only line endings (old Mac style) between rows', () => {
    expect(parseCsv('a,b\r1,2\r')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('parses empty input as no rows', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { cleanBuffer, Ime, type ImeRow } from '../src/lib/ime';

const rows: ImeRow[] = [
  ['ni', '你', 5],
  ['hao', '好', 20],
  ['xue', '学', 60],
  ['xuesheng', '学生', 300],
  ['xuexi', '学习', 400],
  ['hao', '号', 278],
  ['lv', '绿', 2608],
  ['nihao', '你好', 60000],
  ['ni', '呢', 90000],
];

describe('Ime', () => {
  const ime = new Ime(rows);

  it('puts the exact match first', () => {
    expect(ime.candidates('nihao')[0]).toEqual({ h: '你好', used: 5 });
  });

  it('offers shorter prefixes so a phrase can be typed piece by piece', () => {
    const c = ime.candidates('nihao');
    expect(c).toContainEqual({ h: '你', used: 2 });
  });

  it('completes an unfinished word', () => {
    const c = ime.candidates('xues');
    expect(c[0]).toEqual({ h: '学生', used: 4 });
  });

  it('orders same-sound candidates by frequency', () => {
    expect(ime.candidates('hao').map((x) => x.h).slice(0, 2)).toEqual(['好', '号']);
  });

  it('accepts ü typed as v or ü', () => {
    expect(cleanBuffer('Lü')).toBe('lv');
    expect(ime.candidates('lü')[0].h).toBe('绿');
  });

  it('returns nothing for an empty or non-letter buffer', () => {
    expect(ime.candidates('')).toEqual([]);
    expect(ime.candidates('123')).toEqual([]);
  });
});

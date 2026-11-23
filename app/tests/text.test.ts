import { describe, expect, it } from 'vitest';
import { editDistance, foldPinyin, hasHan, hasPersian, normFa, normZh, shuffled, toneOf } from '../src/lib/text';

describe('foldPinyin', () => {
  it('strips tones, spaces and case', () => {
    expect(foldPinyin('Nǐ hǎo')).toBe('nihao');
    expect(foldPinyin('bú kèqi')).toBe('bukeqi');
  });
  it('writes ü as v', () => {
    expect(foldPinyin('lǜsè')).toBe('lvse');
    expect(foldPinyin('nu:3')).toBe('nv');
  });
});

describe('toneOf', () => {
  it('reads the tone mark', () => {
    expect(toneOf('mā')).toBe(1);
    expect(toneOf('má')).toBe(2);
    expect(toneOf('mǎ')).toBe(3);
    expect(toneOf('mà')).toBe(4);
    expect(toneOf('ma')).toBe(5);
  });
});

describe('normFa', () => {
  it('treats Arabic and Persian yeh/kaf as equal', () => {
    expect(normFa('كتابي')).toBe(normFa('کتابی'));
  });
  it('ignores the half-space and diacritics', () => {
    expect(normFa('کتاب‌ها')).toBe(normFa('کتابها'));
    expect(normFa('گُل')).toBe('گل');
  });
  it('unifies digits', () => {
    expect(normFa('۱۲٣')).toBe('123');
  });
});

describe('normZh', () => {
  it('drops punctuation and spaces', () => {
    expect(normZh('你好， 吗？')).toBe('你好吗');
    expect(normZh('你好!')).toBe('你好');
  });
});

describe('editDistance', () => {
  it('counts code-point edits', () => {
    expect(editDistance('我是学生', '我是老师')).toBe(2);
    expect(editDistance('', '你好')).toBe(2);
    expect(editDistance('你好', '你好')).toBe(0);
  });
});

describe('script detection', () => {
  it('detects Han and Persian', () => {
    expect(hasHan('abc 你')).toBe(true);
    expect(hasHan('سلام')).toBe(false);
    expect(hasPersian('سلام')).toBe(true);
  });
});

describe('shuffled', () => {
  it('is a deterministic permutation for a given seed', () => {
    const a = shuffled([1, 2, 3, 4, 5, 6], 42);
    expect(a).toEqual(shuffled([1, 2, 3, 4, 5, 6], 42));
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

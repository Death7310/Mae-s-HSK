import { describe, expect, it } from 'vitest';
import type { Word } from '../src/data/types';
import { indexBySimplified, queryKind, searchExamples, searchLatin, searchPersian, segment } from '../src/lib/lookup';
import { judge } from '../src/pages/Dialogues';

const w = (s: string, p: string, fa: string[], en: string[], lvl = 1, ex?: Word['ex']): Word => ({
  id: s,
  s,
  p,
  fa,
  en,
  lv: { hsk3: lvl },
  ex,
});

const words: Word[] = [
  w('学习', 'xuéxí', ['یاد گرفتن', 'درس خواندن'], ['to study', 'to learn'], 1, [
    { zh: '我在学校学习汉语。', py: 'Wǒ zài xuéxiào xuéxí Hànyǔ.', fa: 'من در مدرسه چینی یاد می‌گیرم.', en: 'I study Chinese at school.' },
  ]),
  w('学', 'xué', ['یاد گرفتن'], ['to learn'], 2),
  w('学校', 'xuéxiào', ['مدرسه'], ['school'], 1),
  w('我', 'wǒ', ['من'], ['I; me'], 1),
  w('在', 'zài', ['در (مکان)', 'بودن در'], ['at; in'], 1),
  w('老', 'lǎo', ['پیر', 'قدیمی (کهنه)'], ['old'], 2),
  w('书', 'shū', ['کتاب'], ['book'], 1),
  w('书店', 'shūdiàn', ['کتاب‌فروشی'], ['bookstore'], 1),
];

describe('queryKind', () => {
  it('detects the script of the query', () => {
    expect(queryKind('你好')).toBe('zh');
    expect(queryKind('کتاب')).toBe('fa');
    expect(queryKind('shu')).toBe('latin');
  });
});

describe('searchPersian', () => {
  it('finds exact gloss matches, lower level first', () => {
    expect(searchPersian(words, 'یاد گرفتن').map((h) => h.word.s)).toEqual(['学习', '学']);
  });
  it('ignores half-space and Arabic letter variants', () => {
    expect(searchPersian(words, 'كتابفروشي')[0].word.s).toBe('书店');
  });
  it('matches a gloss without its parenthesised clarification', () => {
    expect(searchPersian(words, 'قدیمی')[0].word.s).toBe('老');
  });
  it('ranks the exact word above a compound that contains it', () => {
    expect(searchPersian(words, 'کتاب')[0].word.s).toBe('书');
  });
});

describe('searchLatin', () => {
  it('matches toneless pinyin', () => {
    expect(searchLatin(words, 'xuexi')[0].word.s).toBe('学习');
  });
  it('matches English glosses on word boundaries', () => {
    expect(searchLatin(words, 'school').map((h) => h.word.s)).toEqual(['学校']);
    expect(searchLatin(words, 'learn').map((h) => h.word.s)).toContain('学');
  });
});

describe('segment', () => {
  it('prefers the longest dictionary word', () => {
    const tokens = segment('我在学校学习。', indexBySimplified(words));
    expect(tokens.map((x) => x.text)).toEqual(['我', '在', '学校', '学习', '。']);
    expect(tokens[4].words).toEqual([]);
  });
});

describe('searchExamples', () => {
  it('finds sentences by Chinese or Persian fragments', () => {
    expect(searchExamples(words, '学校')).toHaveLength(1);
    expect(searchExamples(words, 'مدرسه')).toHaveLength(1);
    expect(searchExamples(words, 'دانشگاه')).toHaveLength(0);
  });
});

describe('judge (dialogue answers)', () => {
  const line = { zh: '我是学生。', alt: ['我是一个学生。'] };
  it('accepts the model answer regardless of punctuation', () => {
    expect(judge('我是学生', line)).toBe('correct');
    expect(judge('我是一个学生！', line)).toBe('correct');
  });
  it('calls a one-character slip close', () => {
    expect(judge('我是学牛', line)).toBe('close');
  });
  it('rejects a different sentence or an empty reply', () => {
    expect(judge('你好吗', line)).toBe('wrong');
    expect(judge('  ', line)).toBe('wrong');
  });
});

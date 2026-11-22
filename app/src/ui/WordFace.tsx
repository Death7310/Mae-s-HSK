import { t, tMaybe } from '../i18n';
import type { Example, Word } from '../data/types';
import { settings } from '../store/settings';
import { AudioButton, En, Fa, Py, Zh } from './kit';

/** Persian glosses joined with the Persian comma. */
export const faGloss = (w: Word): string => w.fa.join('، ');
export const enGloss = (w: Word): string => w.en.join('; ');

export function posLabel(tag: string): string {
  return tMaybe(`pos.${tag}`) ?? tag;
}

/** The Chinese side of a word: characters, optional pinyin, audio. */
export function ZhSide({ word, pinyin, audio = true }: { word: Word; pinyin: boolean; audio?: boolean }) {
  const s = settings.value;
  return (
    <>
      <Zh class={`hanzi${[...word.s].length > 4 ? ' long' : ''}`}>{word.s}</Zh>
      {s.showTrad && word.t && (
        <div class="small muted">
          {t('study.traditional')}: <Zh>{word.t}</Zh>
        </div>
      )}
      {pinyin && <Py class="pinyin">{word.p}</Py>}
      {audio && <AudioButton text={word.s} file={word.a} accent />}
    </>
  );
}

/** The meaning side of a word: Persian gloss, optional English, POS. */
export function MeaningSide({ word }: { word: Word }) {
  const s = settings.value;
  const hasFa = word.fa.length > 0;
  return (
    <>
      {hasFa ? (
        <Fa class="gloss">{faGloss(word)}</Fa>
      ) : (
        // No Persian gloss yet: fall back to English rather than show nothing.
        <En class="gloss">{enGloss(word)}</En>
      )}
      {s.showEn && hasFa && word.en.length > 0 && <En class="gloss-en">{enGloss(word)}</En>}
      {word.pos && word.pos.length > 0 && (
        <div class="row wrap" style={{ justifyContent: 'center', gap: '6px' }}>
          {word.pos.map((p) => (
            <span key={p} class="chip">
              {posLabel(p)}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

export function ExampleRow({ ex }: { ex: Example }) {
  const s = settings.value;
  return (
    <div class="example">
      <div class="row">
        <div class="grow">
          <Zh>{ex.zh}</Zh>
          {ex.py && <Py>{ex.py}</Py>}
        </div>
        <AudioButton text={ex.zh} file={ex.a} />
      </div>
      {ex.fa && <Fa>{ex.fa}</Fa>}
      {s.showEn && ex.en && (
        <div>
          <En class="small">{ex.en}</En>
        </div>
      )}
    </div>
  );
}

/** Classifier, usage note, examples — the part below the answer. */
export function WordExtras({ word }: { word: Word }) {
  const hasExtras = (word.cl && word.cl.length > 0) || word.note || (word.ex && word.ex.length > 0);
  if (!hasExtras) return null;
  return (
    <div class="col" style={{ width: '100%', textAlign: 'start' }}>
      {word.cl && word.cl.length > 0 && (
        <div class="small">
          <span class="muted">{t('study.classifier')}: </span>
          <Zh>{word.cl.join(' ')}</Zh>
        </div>
      )}
      {word.note && (
        <div class="small">
          <span class="muted">{t('study.note')}: </span>
          <Fa>{word.note}</Fa>
        </div>
      )}
      {word.ex && word.ex.length > 0 && (
        <div>
          <div class="small muted">{t('study.examples')}</div>
          {word.ex.map((ex, i) => (
            <ExampleRow key={i} ex={ex} />
          ))}
        </div>
      )}
    </div>
  );
}

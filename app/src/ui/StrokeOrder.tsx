import HanziWriter from 'hanzi-writer';
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { Icon } from './Icon';

const BASE = `${import.meta.env.BASE_URL}data/strokes/`;

/** Must match STROKE_SHARDS in tools/build_data.py. */
const SHARDS = 32;
const shards = new Map<number, Promise<Record<string, unknown>>>();

/**
 * Stroke data for one character. The data ships with the app (no CDN) in
 * SHARDS files keyed by code point, so a level needs a handful of requests
 * instead of one per character.
 */
export async function loadStrokes(char: string): Promise<unknown> {
  const k = char.codePointAt(0)! % SHARDS;
  let p = shards.get(k);
  if (!p) {
    p = fetch(`${BASE}s${k}.json`).then((r) => {
      if (!r.ok) throw new Error(`stroke data: HTTP ${r.status}`);
      return r.json() as Promise<Record<string, unknown>>;
    });
    p.catch(() => shards.delete(k));
    shards.set(k, p);
  }
  const data = (await p)[char];
  if (!data) throw new Error(`no stroke data for ${char}`);
  return data;
}

/**
 * Animated stroke order with a "practise" mode in which the learner traces
 * each stroke and gets immediate feedback (hanzi-writer quiz).
 */
export function StrokeOrder({ char, size = 240 }: { char: string; size?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const writer = useRef<HanziWriter | undefined>(undefined);
  const [missing, setMissing] = useState(false);
  const [quiz, setQuiz] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let live = true;
    el.replaceChildren();
    setMissing(false);
    const css = getComputedStyle(document.documentElement);
    const w = HanziWriter.create(el, char, {
      width: size,
      height: size,
      padding: 12,
      showOutline: true,
      strokeColor: css.getPropertyValue('--ink').trim() || '#222',
      outlineColor: css.getPropertyValue('--line').trim() || '#ddd',
      radicalColor: css.getPropertyValue('--accent').trim() || '#a4262c',
      drawingColor: css.getPropertyValue('--blue').trim() || '#2b5fa8',
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 180,
      charDataLoader: (c, onLoad, onError) => {
        loadStrokes(c).then(
          (d) => live && onLoad(d as Parameters<typeof onLoad>[0]),
          (e) => {
            if (live) setMissing(true);
            onError(e);
          },
        );
      },
    });
    writer.current = w;
    return () => {
      live = false;
      w.cancelQuiz();
      w.hideCharacter();
      el.replaceChildren();
    };
  }, [char, size]);

  function animate() {
    setQuiz(false);
    writer.current?.cancelQuiz();
    void writer.current?.animateCharacter();
  }

  function practise() {
    setQuiz(true);
    void writer.current?.quiz({ showHintAfterMisses: 2, onComplete: () => setQuiz(false) });
  }

  if (missing) return <p class="center muted small">{t('app.empty')}</p>;
  return (
    <div class="col" style={{ alignItems: 'center' }}>
      <div ref={box} class="hw-box" style={{ width: `${size}px`, touchAction: 'none' }} dir="ltr" />
      <div class="row wrap" style={{ justifyContent: 'center' }}>
        <button type="button" class="btn" onClick={animate}>
          <Icon name="play" />
          {t('words.animate')}
        </button>
        <button type="button" class="btn" aria-pressed={quiz} onClick={practise}>
          <Icon name="pen" />
          {t('words.practice')}
        </button>
      </div>
    </div>
  );
}

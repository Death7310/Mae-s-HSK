import { useEffect, useRef, useState } from 'preact/hooks';
import { defineStrings } from '../i18n';
import { cleanBuffer, loadIme, ZH_PUNCT, type Candidate, type Ime } from '../lib/ime';
import { Icon } from './Icon';

const tr = defineStrings({
  fa: {
    text: 'متن چینی',
    pinyin: 'پین‌یین را با حروف لاتین بنویسید (مثلاً nihao)',
    hint: 'پین‌یین را تایپ کنید و نویسه را انتخاب کنید',
    del: 'پاک کردن',
    send: 'ارسال',
    more: 'بیشتر',
  },
  en: {
    text: 'Chinese text',
    pinyin: 'Type pinyin in Latin letters (e.g. nihao)',
    hint: 'Type pinyin, then pick the characters',
    del: 'Delete',
    send: 'Send',
    more: 'More',
  },
});

/**
 * Chinese text entry that works with any keyboard. The learner types pinyin
 * letters in the lower field and taps a candidate; a learner who does have a
 * Chinese keyboard can also type straight into the upper field.
 */
export function ZhComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  autoFocus,
  submitLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  submitLabel?: string;
}) {
  const [ime, setIme] = useState<Ime>();
  const [buf, setBuf] = useState('');
  const [all, setAll] = useState(false);
  const pinyinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    loadIme().then((i) => live && setIme(i), () => undefined);
    return () => {
      live = false;
    };
  }, []);

  const cands: Candidate[] = ime ? ime.candidates(buf, all ? 80 : 14) : [];

  function pick(c: Candidate) {
    onChange(value + c.h);
    setBuf(cleanBuffer(buf).slice(c.used));
    setAll(false);
    pinyinRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (buf && cands[0]) pick(cands[0]);
      else if (!buf) onSubmit?.();
    } else if (e.key === ' ' && buf && cands[0]) {
      e.preventDefault();
      pick(cands[0]);
    } else if (e.key === 'Backspace' && !buf && value) {
      e.preventDefault();
      onChange([...value].slice(0, -1).join(''));
    } else if (buf && /^[1-9]$/.test(e.key) && cands[Number(e.key) - 1]) {
      e.preventDefault();
      pick(cands[Number(e.key) - 1]);
    } else if (!buf && ZH_PUNCT[e.key]) {
      e.preventDefault();
      onChange(value + ZH_PUNCT[e.key]);
    }
  }

  return (
    <div class="composer">
      <div class="row">
        <textarea
          class="input zh composer-text"
          lang="zh-Hans"
          dir="ltr"
          rows={2}
          value={value}
          placeholder={placeholder}
          aria-label={tr('text')}
          onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
        />
        <button
          type="button"
          class="iconbtn"
          aria-label={tr('del')}
          disabled={!value}
          onClick={() => onChange([...value].slice(0, -1).join(''))}
        >
          <Icon name="x" />
        </button>
      </div>
      <div class="cands" role="listbox" aria-label={tr('hint')}>
        {cands.map((c, i) => (
          <button key={`${c.h}/${c.used}`} type="button" role="option" class="zh" lang="zh-Hans" onClick={() => pick(c)}>
            {i < 9 && <small aria-hidden="true">{i + 1}</small>}
            {c.h}
          </button>
        ))}
        {buf && !all && cands.length >= 14 && (
          <button type="button" class="more" onClick={() => setAll(true)}>
            {tr('more')}…
          </button>
        )}
        {!buf && <span class="small muted">{tr('hint')}</span>}
        {!buf &&
          Object.values(ZH_PUNCT)
            .slice(0, 4)
            .map((p) => (
              <button key={p} type="button" class="zh" onClick={() => onChange(value + p)}>
                {p}
              </button>
            ))}
      </div>
      <div class="row">
        <input
          ref={pinyinRef}
          class="input py"
          dir="ltr"
          lang="zh-Latn"
          type="text"
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellcheck={false}
          autoFocus={autoFocus}
          value={buf}
          placeholder="pinyin"
          aria-label={tr('pinyin')}
          onInput={(e) => {
            setBuf((e.target as HTMLInputElement).value);
            setAll(false);
          }}
          onKeyDown={onKeyDown}
        />
        {onSubmit && (
          <button type="button" class="btn primary" disabled={!value.trim()} onClick={onSubmit}>
            {submitLabel ?? tr('send')}
          </button>
        )}
      </div>
    </div>
  );
}

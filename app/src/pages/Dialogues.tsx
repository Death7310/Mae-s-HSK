import { useEffect, useRef, useState } from 'preact/hooks';
import { loadDialogues } from '../data/loader';
import type { Dialogue, DialogueLine } from '../data/types';
import { defineStrings, t } from '../i18n';
import { playZh, stopAudio } from '../lib/audio';
import { go, href, route } from '../lib/router';
import { editDistance, normZh } from '../lib/text';
import { settings } from '../store/settings';
import { Icon } from '../ui/Icon';
import { AudioButton, BottomNav, En, ErrorBox, Fa, Py, Segmented, Spinner, TopBar, useAsync, Zh } from '../ui/kit';
import { ZhComposer } from '../ui/ZhComposer';

const tr = defineStrings({
  fa: {
    none: 'برای این سطح هنوز گفت‌وگویی آماده نشده است.',
    read: 'خواندن و شنیدن',
    play: 'نقش‌آفرینی',
    lines: '{n} جمله',
    playAll: 'پخش همه',
    role: 'شما نقش {who} را دارید. پاسخ را به چینی بنویسید.',
    yourTurn: 'نوبت شماست. این را به چینی بگویید:',
    hint: 'راهنمایی',
    check: 'ارسال',
    correct: 'درست!',
    close: 'نزدیک بود. پاسخ نمونه:',
    wrong: 'پاسخ نمونه:',
    done: 'گفت‌وگو تمام شد. {n} از {m} پاسخ درست یا نزدیک بود.',
    again: 'دوباره',
    switch: 'عوض کردن نقش',
    translator: 'واژه‌نامه و عبارت‌یاب',
    showFa: 'ترجمهٔ فارسی',
    showPy: 'پین‌یین',
  },
  en: {
    none: 'No dialogues are available for this level yet.',
    read: 'Read and listen',
    play: 'Role-play',
    lines: '{n} lines',
    playAll: 'Play all',
    role: 'You play {who}. Type your replies in Chinese.',
    yourTurn: 'Your turn. Say this in Chinese:',
    hint: 'Hint',
    check: 'Send',
    correct: 'Correct!',
    close: 'Close. A model answer:',
    wrong: 'A model answer:',
    done: 'Dialogue finished. {n} of {m} replies were correct or close.',
    again: 'Again',
    switch: 'Switch roles',
    translator: 'Dictionary and phrase finder',
    showFa: 'Persian translation',
    showPy: 'Pinyin',
  },
});

type Verdict = 'correct' | 'close' | 'wrong';

/**
 * Compare a typed reply with the model line and its accepted variants.
 * Punctuation and spacing are ignored; a reply within ~20% edit distance of
 * any accepted answer counts as "close" (typos, a missing particle).
 */
export function judge(input: string, line: Pick<DialogueLine, 'zh' | 'alt'>): Verdict {
  const got = normZh(input);
  if (!got) return 'wrong';
  let best: Verdict = 'wrong';
  for (const answer of [line.zh, ...(line.alt ?? [])]) {
    const want = normZh(answer);
    if (got === want) return 'correct';
    const len = Math.max([...want].length, [...got].length);
    if (editDistance(got, want) <= Math.max(1, Math.floor(len * 0.2))) best = 'close';
  }
  return best;
}

function Line({ line, me, showFa, showPy }: { line: DialogueLine; me: boolean; showFa: boolean; showPy: boolean }) {
  return (
    <div class={`bubble${me ? ' me' : ''}`}>
      <div class="row" style={{ gap: '4px' }}>
        <span class="grow">
          <Zh>{line.zh}</Zh>
          {showPy && <Py>{line.py}</Py>}
        </span>
        <AudioButton text={line.zh} file={line.a} />
      </div>
      {showFa && <Fa>{line.fa}</Fa>}
      {showFa && settings.value.showEn && line.en && (
        <div>
          <En class="small">{line.en}</En>
        </div>
      )}
    </div>
  );
}

export function Dialogues() {
  const s = settings.value;
  const id = route.value.parts[0] === 'dialogues' ? route.value.parts[1] : undefined;
  const state = useAsync(() => loadDialogues(s.std, s.level), [s.std, s.level]);
  const current = state.data?.find((d) => d.id === id);

  if (current) return <DialogueView key={current.id} dialogue={current} />;
  return (
    <div class="shell">
      <TopBar title={`${t('mod.dialogues')} · ${t('level.hsk', { n: s.level })}`} backTo="" />
      <main class="page">
        {state.loading && !state.data && <Spinner />}
        {state.error !== undefined && <ErrorBox error={state.error} retry={state.reload} />}
        {state.data && state.data.length === 0 && <p class="card center muted">{tr('none')}</p>}
        {state.data && state.data.length > 0 && (
          <div class="list">
            {state.data.map((d) => (
              <a key={d.id} href={href(`dialogues/${d.id}`)}>
                <span class="grow">
                  <b>{d.title.fa}</b>
                  <span class="small muted" style={{ display: 'block' }}>
                    <Zh>{d.title.zh}</Zh> · {tr('lines', { n: d.lines.length })}
                  </span>
                </span>
                <Icon name="chevron" flip width="20" height="20" />
              </a>
            ))}
          </div>
        )}
        <a class="btn" href={href('translate')}>
          <Icon name="translate" />
          {tr('translator')}
        </a>
      </main>
      <BottomNav />
    </div>
  );
}

function DialogueView({ dialogue }: { dialogue: Dialogue }) {
  const [mode, setMode] = useState<'read' | 'play'>('read');
  const [showFa, setShowFa] = useState(true);
  const [showPy, setShowPy] = useState(true);
  const speakers = [...new Set(dialogue.lines.map((l) => l.who))];
  const [me, setMe] = useState(speakers[1] ?? speakers[0]);

  async function playAll() {
    for (const line of dialogue.lines) {
      if (!(await playZh(line.zh, line.a))) break;
    }
  }
  useEffect(() => stopAudio, []);

  return (
    <div class="shell">
      <TopBar title={dialogue.title.fa} backTo="dialogues" />
      <main class="page no-nav">
        {dialogue.scene && <p class="small muted">{dialogue.scene}</p>}
        <div class="row wrap" style={{ justifyContent: 'center' }}>
          <Segmented
            value={mode}
            options={[
              { value: 'read', label: tr('read') },
              { value: 'play', label: tr('play') },
            ]}
            onChange={setMode}
          />
        </div>
        {mode === 'read' ? (
          <>
            <div class="row wrap" style={{ justifyContent: 'center' }}>
              <button type="button" class="chip" aria-pressed={showPy} onClick={() => setShowPy(!showPy)}>
                {showPy ? '✓ ' : ''}
                {tr('showPy')}
              </button>
              <button type="button" class="chip" aria-pressed={showFa} onClick={() => setShowFa(!showFa)}>
                {showFa ? '✓ ' : ''}
                {tr('showFa')}
              </button>
              <button type="button" class="chip due" onClick={() => void playAll()}>
                ▶ {tr('playAll')}
              </button>
            </div>
            <div class="col">
              {dialogue.lines.map((line, i) => (
                <Line key={i} line={line} me={line.who === speakers[1]} showFa={showFa} showPy={showPy} />
              ))}
            </div>
          </>
        ) : (
          <RolePlay
            key={me}
            dialogue={dialogue}
            me={me}
            onSwitch={speakers.length > 1 ? () => setMe(speakers[(speakers.indexOf(me) + 1) % speakers.length]) : undefined}
          />
        )}
        <a class="btn ghost" href={href('dialogues')} onClick={() => go('dialogues')}>
          {t('app.back')}
        </a>
      </main>
    </div>
  );
}

interface Turn {
  line: DialogueLine;
  typed?: string;
  verdict?: Verdict;
}

/**
 * Scripted conversation: the app speaks the other role's lines; on the
 * learner's turns it shows the Persian meaning and the learner types the
 * Chinese line (with the built-in pinyin keyboard).
 */
function RolePlay({ dialogue, me, onSwitch }: { dialogue: Dialogue; me: string; onSwitch?: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pos, setPos] = useState(0);
  const [text, setText] = useState('');
  const [hint, setHint] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const line = dialogue.lines[pos];
  const mine = line?.who === me;

  // Play the partner's lines automatically until it is the learner's turn.
  useEffect(() => {
    if (!line || mine) return;
    let live = true;
    setTurns((ts) => [...ts, { line }]);
    void playZh(line.zh, line.a).then(() => live && setPos((p) => p + 1));
    return () => {
      live = false;
    };
  }, [pos]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [turns.length, pos]);

  function submit() {
    if (!line || !text.trim()) return;
    const verdict = judge(text, line);
    setTurns((ts) => [...ts, { line, typed: text, verdict }]);
    setText('');
    setHint(false);
    void playZh(line.zh, line.a);
    setPos((p) => p + 1);
  }

  const mineDone = turns.filter((x) => x.verdict);
  const good = mineDone.filter((x) => x.verdict !== 'wrong').length;

  return (
    <>
      <p class="small muted center">{tr('role', { who: me })}</p>
      <div class="col">
        {turns.map((turn, i) =>
          turn.verdict ? (
            <div key={i} class="col" style={{ gap: '4px' }}>
              <div class="bubble me">
                <Zh>{turn.typed}</Zh>
              </div>
              <div class="bubble me" style={{ background: 'var(--surface)' }}>
                <span class={`chip ${turn.verdict === 'correct' ? 'ok' : turn.verdict === 'close' ? 'warn' : 'due'}`}>
                  {tr(turn.verdict)}
                </span>
                {turn.verdict !== 'correct' && (
                  <>
                    <Zh>{turn.line.zh}</Zh>
                    <Py>{turn.line.py}</Py>
                  </>
                )}
              </div>
            </div>
          ) : (
            <Line key={i} line={turn.line} me={false} showFa showPy />
          ),
        )}
        {line && mine && (
          <div class="card col">
            <div class="small muted">{tr('yourTurn')}</div>
            <Fa class="gloss">{line.fa}</Fa>
            {hint ? (
              <Py>{line.py}</Py>
            ) : (
              <button type="button" class="chip" onClick={() => setHint(true)}>
                {tr('hint')}
              </button>
            )}
            <ZhComposer value={text} onChange={setText} onSubmit={submit} submitLabel={tr('check')} />
          </div>
        )}
        {!line && (
          <div class="card col center">
            <p>{tr('done', { n: good, m: mineDone.length })}</p>
            <button
              type="button"
              class="btn primary"
              onClick={() => {
                setTurns([]);
                setPos(0);
              }}
            >
              {tr('again')}
            </button>
            {onSwitch && (
              <button type="button" class="btn" onClick={onSwitch}>
                <Icon name="swap" />
                {tr('switch')}
              </button>
            )}
          </div>
        )}
        <div ref={end} />
      </div>
    </>
  );
}

import { audioUrl } from '../data/loader';

/**
 * Audio playback. Preference order:
 *  1. a bundled recording (word.a / example.a), fully offline;
 *  2. the device's own Mandarin speech-synthesis voice, if one is installed
 *     (works offline on most Android, iOS, macOS and Windows devices);
 *  3. nothing — callers get `false` and can show a "no audio" hint.
 */

let current: HTMLAudioElement | undefined;

export function stopAudio(): void {
  current?.pause();
  current = undefined;
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

export function playFile(rel: string, rate = 1): Promise<boolean> {
  stopAudio();
  return new Promise((resolve) => {
    const el = new Audio(audioUrl(rel));
    el.playbackRate = rate;
    current = el;
    el.addEventListener('ended', () => resolve(true), { once: true });
    el.addEventListener('error', () => resolve(false), { once: true });
    el.play().catch(() => resolve(false));
  });
}

let voicesReady: Promise<SpeechSynthesisVoice[]> | undefined;

function voices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve([]);
  voicesReady ??= new Promise((resolve) => {
    const now = speechSynthesis.getVoices();
    if (now.length) return resolve(now);
    // Chrome loads voices asynchronously; give it a moment, then give up.
    const timer = setTimeout(() => resolve(speechSynthesis.getVoices()), 1500);
    speechSynthesis.addEventListener(
      'voiceschanged',
      () => {
        clearTimeout(timer);
        resolve(speechSynthesis.getVoices());
      },
      { once: true },
    );
  });
  return voicesReady;
}

/** Best installed voice for a BCP-47 language prefix; local voices first. */
export async function pickVoice(langPrefix: string): Promise<SpeechSynthesisVoice | undefined> {
  const all = (await voices()).filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(langPrefix));
  // zh-CN (Mainland Mandarin) before zh-TW / zh-HK, on-device before network voices.
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang.toLowerCase().replace('_', '-').startsWith('zh-cn') ? 2 : 0) + (v.localService ? 1 : 0);
  return all.sort((a, b) => score(b) - score(a))[0];
}

export async function hasSpeech(langPrefix = 'zh'): Promise<boolean> {
  return !!(await pickVoice(langPrefix));
}

export async function speak(text: string, langPrefix = 'zh', rate = 0.9): Promise<boolean> {
  const voice = await pickVoice(langPrefix);
  if (!voice) return false;
  stopAudio();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = rate;
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    speechSynthesis.speak(u);
  });
}

/** Play Chinese text: bundled recording if there is one, else device speech. */
export async function playZh(text: string, rel?: string, rate = 1): Promise<boolean> {
  if (rel && (await playFile(rel, rate))) return true;
  return speak(text, 'zh', 0.9 * rate);
}

import type { ComponentType } from 'preact';
import { route } from './lib/router';
import { About } from './pages/About';
import { Dialogues } from './pages/Dialogues';
import { Grammar } from './pages/Grammar';
import { Home, Levels } from './pages/Home';
import { Listening } from './pages/Listening';
import { Onboarding } from './pages/Onboarding';
import { Quiz } from './pages/Quiz';
import { Settings } from './pages/Settings';
import { Study } from './pages/Study';
import { Translator } from './pages/Translator';
import { WordDetail, Words } from './pages/Words';
import { Writing } from './pages/Writing';
import { settings, settingsReady } from './store/settings';
import { Spinner } from './ui/kit';

/**
 * Route table: first path segment -> page. Pages read further segments and
 * query parameters from the `route` signal themselves.
 */
const ROUTES: Record<string, ComponentType> = {
  '': Home,
  levels: Levels,
  study: Study,
  words: Words,
  word: WordDetail,
  quiz: Quiz,
  listening: Listening,
  writing: Writing,
  dialogues: Dialogues,
  talk: Dialogues,
  grammar: Grammar,
  translate: Translator,
  settings: Settings,
  about: About,
};

export function App() {
  if (!settingsReady.value) return <Spinner />;
  if (!settings.value.onboarded) return <Onboarding />;
  const Page = ROUTES[route.value.parts[0] ?? ''] ?? Home;
  return <Page />;
}

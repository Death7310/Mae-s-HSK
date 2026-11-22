import '@fontsource-variable/vazirmatn';
import { render } from 'preact';
import { App } from './app';
import { bindDocument, loadSettings } from './store/settings';
import './styles/base.css';

bindDocument();
void loadSettings();
render(<App />, document.getElementById('app')!);

// Ask the browser not to evict our IndexedDB/Cache data under storage pressure:
// the learner's review history lives there.
void navigator.storage?.persist?.().catch(() => undefined);
